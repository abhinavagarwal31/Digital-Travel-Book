import type { TripPath } from '@tb/shared';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useRef } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import landTopology from 'world-atlas/land-110m.json';
import { facing, liftedArc, projectLifted } from '../lib/globe.ts';

/** A colour per trip, bright enough to glow over both the ocean and the land. */
const TRIP_COLOURS = ['#ff9a62', '#7dd3fc', '#c4b5fd', '#86efac', '#fcd34d', '#f9a8d4'];

const topology = landTopology as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topology, topology.objects.land) as GeoPermissibleObjects;
const GRATICULE = geoGraticule10();
/** Degrees the globe turns by itself each second. */
const SPIN = 6;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A small globe of everywhere the trips have been: one dot per place, joined
 * in the order visited by arcs that lift off the surface like flight paths,
 * with a light travelling along each. Fainter white arcs join one trip to the
 * next, in date order. It turns slowly by itself (unless the
 * reader prefers less motion) and can be spun by dragging.
 */
export default function WorldGlobe({ trips, size = 300 }: { trips: TripPath[]; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rotation = useRef<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const centre = size / 2;
    const r = size * 0.38;
    rotation.current ??= facing(trips.flatMap((t) => t.points));
    const projection = geoOrthographic().scale(r).translate([centre, centre]).clipAngle(90);
    const path = geoPath(projection, ctx);
    const within = trips.flatMap((trip, i) =>
      trip.points.slice(1).map((to, j) => ({
        points: liftedArc(trip.points[j] as (typeof trip.points)[number], to),
        colour: TRIP_COLOURS[i % TRIP_COLOURS.length] as string,
        faint: false,
      })),
    );
    // Trips in date order, each joined to the next: one long journey across the years.
    const ordered = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const between = ordered.slice(1).flatMap((trip, i) => {
      const from = ordered[i]?.points.at(-1);
      const to = trip.points[0];
      return from && to
        ? [{ points: liftedArc(from, to, 72), colour: '#ffffff', faint: true }]
        : [];
    });
    const arcs = [...between, ...within];
    const still = reducedMotion();
    let frame = 0;
    let onScreen = true;
    let last = performance.now();

    const draw = (now: number) => {
      const turn = rotation.current as [number, number];
      if (!still && !drag.current) turn[0] += (SPIN * (now - last)) / 1000;
      last = now;
      projection.rotate(turn);
      ctx.clearRect(0, 0, size, size);

      // Atmosphere, then the ocean lit from the upper left.
      const halo = ctx.createRadialGradient(centre, centre, r * 0.9, centre, centre, r * 1.22);
      halo.addColorStop(0, 'rgb(120 190 255 / 0.35)');
      halo.addColorStop(1, 'rgb(120 190 255 / 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(centre, centre, r * 1.22, 0, Math.PI * 2);
      ctx.fill();

      const ocean = ctx.createRadialGradient(
        centre - r * 0.35,
        centre - r * 0.4,
        r * 0.1,
        centre,
        centre,
        r,
      );
      ocean.addColorStop(0, '#2f6ea3');
      ocean.addColorStop(1, '#0c2340');
      ctx.fillStyle = ocean;
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fill();

      ctx.strokeStyle = 'rgb(255 255 255 / 0.07)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      path(GRATICULE);
      ctx.stroke();

      ctx.fillStyle = '#d9cfb8';
      ctx.strokeStyle = 'rgb(60 50 30 / 0.35)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      path(LAND);
      ctx.fill();
      ctx.stroke();

      // The night side: shading towards the lower right gives the ball its depth.
      const shade = ctx.createRadialGradient(
        centre - r * 0.45,
        centre - r * 0.5,
        r * 0.2,
        centre,
        centre,
        r * 1.05,
      );
      shade.addColorStop(0, 'rgb(255 255 255 / 0.12)');
      shade.addColorStop(0.6, 'rgb(0 0 0 / 0)');
      shade.addColorStop(1, 'rgb(0 0 20 / 0.45)');
      ctx.fillStyle = shade;
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fill();

      // Flight paths, a soft glow under a bright line, drawn only where they show.
      for (const arc of arcs) {
        const screen = arc.points.map((p) =>
          projectLifted(p.lonLat, p.altitude, turn, r, centre, centre),
        );
        const layers = arc.faint
          ? ([
              [4, 0.08],
              [1.2, 0.55],
            ] as const)
          : ([
              [5, 0.18],
              [1.8, 0.95],
            ] as const);
        for (const [width, alpha] of layers) {
          ctx.strokeStyle = arc.colour;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          screen.forEach((p, i) => {
            const prev = screen[i - 1];
            if (p.visible && prev?.visible) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          });
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // A light travelling along the path.
        if (!still) {
          const t = ((now / 2600 + arcs.indexOf(arc) * 0.37) % 1) * (screen.length - 1);
          const p = screen[Math.round(t)];
          if (p?.visible) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Places: a glowing dot each, on the side facing us.
      const view: [number, number] = [-turn[0], -turn[1]];
      trips.forEach((trip, i) => {
        const colour = TRIP_COLOURS[i % TRIP_COLOURS.length] as string;
        for (const p of trip.points) {
          if (geoDistance([p.lng, p.lat], view) > Math.PI / 2) continue;
          const [x, y] = projection([p.lng, p.lat]) ?? [0, 0];
          ctx.fillStyle = colour;
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      if (!still && onScreen) frame = requestAnimationFrame(draw);
    };

    redraw.current = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    // Only spins while it can be seen.
    const watcher = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      if (onScreen) redraw.current();
    });
    watcher.observe(el);
    redraw.current();
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
    };
  }, [trips, size]);

  const places = trips.reduce((n, t) => n + t.points.length, 0);
  return (
    <canvas
      ref={canvas}
      className="world-globe"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        places === 0
          ? 'A globe, waiting for your first trip'
          : `A globe showing ${places} ${places === 1 ? 'place' : 'places'} from ${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`
      }
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const from = drag.current;
        const turn = rotation.current;
        if (!from || !turn) return;
        turn[0] += (e.clientX - from.x) * 0.45;
        turn[1] = Math.max(-60, Math.min(60, turn[1] - (e.clientY - from.y) * 0.45));
        drag.current = { x: e.clientX, y: e.clientY };
        redraw.current();
      }}
      onPointerUp={() => {
        drag.current = null;
        redraw.current();
      }}
    />
  );
}
