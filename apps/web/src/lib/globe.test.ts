import { describe, expect, it } from 'vitest';
import { facing, liftedArc, projectLifted } from './globe.ts';

const DELHI = { lat: 28.6, lng: 77.2 };
const JAIPUR = { lat: 26.9, lng: 75.8 };
const NEW_YORK = { lat: 40.7, lng: -74 };

describe('liftedArc', () => {
  it('starts and ends on the ground at the two places, rising in between', () => {
    const arc = liftedArc(DELHI, JAIPUR, 10);
    expect(arc[0]?.altitude).toBeCloseTo(0);
    expect(arc.at(-1)?.altitude).toBeCloseTo(0);
    expect(arc[0]?.lonLat[0]).toBeCloseTo(DELHI.lng);
    expect(arc.at(-1)?.lonLat[1]).toBeCloseTo(JAIPUR.lat);
    expect(arc[5]?.altitude).toBeGreaterThan(0);
  });

  it('flies a long journey higher than a short hop', () => {
    const peak = (a: typeof DELHI, b: typeof DELHI) =>
      Math.max(...liftedArc(a, b).map((p) => p.altitude));
    expect(peak(DELHI, NEW_YORK)).toBeGreaterThan(peak(DELHI, JAIPUR) * 4);
  });
});

describe('projectLifted', () => {
  it('puts the point the globe faces at its centre, and hides the far side', () => {
    const front = projectLifted([77.2, 28.6], 0, [-77.2, -28.6], 100, 150, 150);
    expect(front).toMatchObject({ visible: true });
    expect(front.x).toBeCloseTo(150);
    expect(front.y).toBeCloseTo(150);
    const back = projectLifted([-102.8, -28.6], 0, [-77.2, -28.6], 100, 150, 150);
    expect(back.visible).toBe(false);
  });

  it('shows a high point just past the edge, which a ground point there would not be', () => {
    // 95° from the centre of view: just behind the horizon.
    expect(projectLifted([95, 0], 0, [0, 0], 100, 0, 0).visible).toBe(false);
    expect(projectLifted([95, 0], 0.3, [0, 0], 100, 0, 0).visible).toBe(true);
  });
});

describe('facing', () => {
  it('turns the globe to the middle of the trips', () => {
    const [λ, φ] = facing([DELHI, JAIPUR]);
    expect(-λ).toBeGreaterThan(75);
    expect(-λ).toBeLessThan(78);
    expect(-φ).toBeGreaterThan(26);
  });

  it('agrees across the date line, and starts somewhere sensible with no trips', () => {
    const [λ] = facing([
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ]);
    expect(Math.abs(Math.abs(λ) - 180)).toBeLessThan(1);
    expect(facing([])).toHaveLength(2);
  });
});
