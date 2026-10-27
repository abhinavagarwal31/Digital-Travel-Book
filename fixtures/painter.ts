// A tiny raster painter for test photos: gradients, shapes, simple travel
// scenes and a 5×7 pixel font, so every generated photo shows what it tests.

export type Rgb = [number, number, number];

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const mixC = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  mixC(a[0], b[0], t),
  mixC(a[1], b[1], t),
  mixC(a[2], b[2], t),
];

/** A deterministic random sequence, so the same seed draws the same picture. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4, 255);
  }

  /** Paints a pixel, blending with what is there by `alpha`. */
  set(x: number, y: number, rgb: Rgb, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    d[i] = clamp(mixC(d[i] as number, rgb[0], alpha));
    d[i + 1] = clamp(mixC(d[i + 1] as number, rgb[1], alpha));
    d[i + 2] = clamp(mixC(d[i + 2] as number, rgb[2], alpha));
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, rgb: Rgb, alpha = 1) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.width, x + w); xx++) {
        this.set(xx, yy, rgb, alpha);
      }
    }
  }

  circle(cx: number, cy: number, r: number, rgb: Rgb, alpha = 1) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, rgb, alpha);
      }
    }
  }

  /** Fills each column from the curve y = f(x) down to the bottom. */
  below(f: (x: number) => number, colour: (x: number, y: number, top: number) => Rgb) {
    for (let x = 0; x < this.width; x++) {
      const top = Math.max(0, Math.floor(f(x)));
      for (let y = top; y < this.height; y++) this.set(x, y, colour(x, y, top));
    }
  }

  verticalGradient(top: Rgb, bottom: Rgb, y0 = 0, y1 = this.height) {
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y++) {
      const c = mix(top, bottom, (y - y0) / Math.max(1, y1 - y0));
      for (let x = 0; x < this.width; x++) this.set(x, y, c);
    }
  }

  sun(cx: number, cy: number, r: number, rgb: Rgb) {
    for (let y = Math.floor(cy - r * 3); y <= cy + r * 3; y++) {
      for (let x = Math.floor(cx - r * 3); x <= cx + r * 3; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) this.set(x, y, rgb);
        else if (d < r * 3) this.set(x, y, rgb, (1 - (d - r) / (r * 2)) ** 2 * 0.45);
      }
    }
  }

  /** Text in the 5×7 font; each font pixel becomes a `scale`-sized block. */
  text(value: string, x: number, y: number, scale: number, rgb: Rgb) {
    let cx = x;
    for (const ch of value.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT['?'];
      glyph?.forEach((row, gy) => {
        for (let gx = 0; gx < 5; gx++) {
          if (row[gx] === '#') this.rect(cx + gx * scale, y + gy * scale, scale, scale, rgb);
        }
      });
      cx += 6 * scale;
    }
  }

  /** A dark band along the bottom with up to two lines of label text. */
  label(title: string, detail: string) {
    const big = Math.max(3, Math.round(this.width / 260));
    const small = Math.max(2, Math.round(big * 0.6));
    const bandH = big * 7 + small * 7 + big * 5;
    const top = this.height - bandH;
    this.rect(0, top, this.width, bandH, [12, 10, 8], 0.72);
    this.text(fit(title, this.width, big), big * 2, top + big * 1.5, big, [255, 236, 170]);
    this.text(
      fit(detail, this.width, small),
      big * 2,
      top + big * 3 + big * 7,
      small,
      [235, 235, 235],
    );
  }
}

const fit = (s: string, width: number, scale: number) =>
  s.slice(0, Math.floor((width - scale * 4) / (6 * scale)));

/** Adds film-like grain so photos are not perfectly flat (and compress like photos). */
export function grain(canvas: Canvas, amount: number, rand: () => number) {
  const d = canvas.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] = clamp((d[i] as number) + n);
    d[i + 1] = clamp((d[i + 1] as number) + n);
    d[i + 2] = clamp((d[i + 2] as number) + n);
  }
}

// ---------- Scenes ----------

export type Scene =
  | 'fort'
  | 'palace'
  | 'desert'
  | 'lake'
  | 'market'
  | 'bluecity'
  | 'airport'
  | 'beach'
  | 'ticket'
  | 'plain';

const SKY_DAY: [Rgb, Rgb] = [
  [96, 160, 222],
  [214, 232, 246],
];
const SKY_SUNSET: [Rgb, Rgb] = [
  [88, 92, 160],
  [252, 178, 112],
];
const SKY_NIGHT: [Rgb, Rgb] = [
  [10, 14, 40],
  [56, 44, 88],
];

export interface SceneOptions {
  scene: Scene;
  /** 0 morning … 1 night; changes the sky. */
  light?: 'day' | 'sunset' | 'night';
  seed: number;
}

export function paintScene(canvas: Canvas, { scene, light = 'day', seed }: SceneOptions) {
  const r = seeded(seed);
  const W = canvas.width;
  const H = canvas.height;
  const sky = light === 'night' ? SKY_NIGHT : light === 'sunset' ? SKY_SUNSET : SKY_DAY;
  const horizon = H * (0.55 + r() * 0.1);

  if (scene === 'ticket') return paintTicket(canvas, r);
  if (scene === 'plain') {
    canvas.verticalGradient([60 + r() * 120, 80 + r() * 100, 140 + r() * 80], [30, 30, 50]);
    return;
  }

  canvas.verticalGradient(sky[0], sky[1], 0, Math.ceil(horizon) + 2);
  if (light === 'night') {
    for (let i = 0; i < 160; i++) canvas.set(r() * W, r() * horizon * 0.8, [255, 255, 255], r());
    canvas.circle(W * (0.15 + r() * 0.2), H * 0.16, H * 0.04, [250, 248, 230]);
  } else {
    canvas.sun(
      W * (0.6 + r() * 0.3),
      horizon * (light === 'sunset' ? 0.8 : 0.3),
      H * 0.055,
      [255, 246, 214],
    );
  }

  switch (scene) {
    case 'fort': {
      const ground: Rgb = [196, 150, 96];
      canvas.below(
        (x) => horizon - 20 * Math.sin(x / 140),
        (_x, y) => mix(ground, [120, 84, 50], (y - horizon) / (H - horizon)),
      );
      const wallTop = horizon - H * 0.22;
      const wall: Rgb = [214, 160, 92];
      canvas.rect(W * 0.08, wallTop, W * 0.84, horizon - wallTop + 10, wall);
      for (let x = W * 0.08; x < W * 0.92; x += W * 0.04)
        canvas.rect(x, wallTop - H * 0.03, W * 0.022, H * 0.03, wall);
      for (const tx of [0.1, 0.48, 0.86]) {
        canvas.rect(W * tx - W * 0.04, wallTop - H * 0.12, W * 0.08, H * 0.13, [200, 146, 82]);
        canvas.circle(W * tx, wallTop - H * 0.12, W * 0.04, [226, 176, 110]);
      }
      for (let x = W * 0.14; x < W * 0.88; x += W * 0.09) {
        canvas.rect(x, horizon - H * 0.1, W * 0.045, H * 0.1, [92, 58, 36]);
        canvas.circle(x + W * 0.0225, horizon - H * 0.1, W * 0.0225, [92, 58, 36]);
      }
      break;
    }
    case 'palace': {
      canvas.below(
        () => horizon,
        () => [176, 120, 110],
      );
      const pink: Rgb = [226, 132, 120];
      for (let tier = 0; tier < 5; tier++) {
        const w = W * (0.7 - tier * 0.11);
        const y = horizon - H * 0.09 * (tier + 1);
        canvas.rect((W - w) / 2, y, w, H * 0.09 + 2, mix(pink, [244, 168, 150], tier / 5));
        for (let x = (W - w) / 2 + W * 0.015; x < (W + w) / 2 - W * 0.02; x += W * 0.035) {
          canvas.rect(x, y + H * 0.025, W * 0.018, H * 0.045, [250, 214, 190]);
          canvas.circle(x + W * 0.009, y + H * 0.025, W * 0.009, [250, 214, 190]);
        }
      }
      break;
    }
    case 'desert': {
      const sand: Rgb = light === 'sunset' ? [232, 150, 84] : [236, 196, 128];
      for (let layer = 0; layer < 4; layer++) {
        const base = horizon + layer * H * 0.09;
        const amp = H * (0.05 + r() * 0.04);
        const ph = r() * 6;
        canvas.below(
          (x) => base - amp * Math.sin(x / (W * 0.12) + ph),
          (_x, y, top) =>
            mix(
              mix(sand, [150, 96, 52], layer * 0.18),
              [120, 76, 40],
              Math.min(1, (y - top) / (H * 0.5)) * 0.4,
            ),
        );
      }
      // A camel on the ridge.
      const cx = W * (0.25 + r() * 0.4);
      const cy = horizon + H * 0.02;
      const dark: Rgb = [40, 26, 18];
      canvas.circle(cx, cy, W * 0.045, dark);
      canvas.circle(cx - W * 0.01, cy - W * 0.035, W * 0.025, dark);
      canvas.rect(cx + W * 0.035, cy - W * 0.07, W * 0.012, W * 0.07, dark);
      canvas.circle(cx + W * 0.048, cy - W * 0.07, W * 0.014, dark);
      for (const lx of [-0.03, -0.012, 0.015, 0.03])
        canvas.rect(cx + W * lx, cy + W * 0.03, W * 0.007, W * 0.07, dark);
      break;
    }
    case 'lake': {
      canvas.below(
        (x) => horizon - H * 0.12 - H * 0.05 * Math.sin(x / (W * 0.2)),
        () => [84, 96, 92],
      );
      const palace: Rgb = [246, 238, 222];
      canvas.rect(W * 0.3, horizon - H * 0.14, W * 0.4, H * 0.14, palace);
      for (const dx of [0.33, 0.5, 0.67])
        canvas.circle(W * dx, horizon - H * 0.14, W * 0.035, palace);
      for (let x = W * 0.32; x < W * 0.68; x += W * 0.03)
        canvas.rect(x, horizon - H * 0.09, W * 0.012, H * 0.05, [150, 140, 128]);
      // Water: the scene above, mirrored and darkened, with ripples.
      for (let y = Math.ceil(horizon); y < H; y++) {
        const src = Math.floor(horizon - (y - horizon) * 1.1);
        for (let x = 0; x < W; x++) {
          const sx = Math.floor(x + Math.sin(y / 3) * 4);
          const i = (Math.max(0, src) * W + Math.min(W - 1, Math.max(0, sx))) * 4;
          const d = canvas.data;
          const c: Rgb = [
            (d[i] as number) * 0.7,
            (d[i + 1] as number) * 0.78,
            (d[i + 2] as number) * 0.9,
          ];
          canvas.set(x, y, c);
        }
      }
      break;
    }
    case 'market': {
      canvas.below(
        () => horizon,
        () => [54, 40, 36],
      );
      for (let x = 0; x < W; x += W * 0.12) {
        const h = H * (0.15 + r() * 0.2);
        canvas.rect(x, horizon - h, W * 0.12 - 4, h, [38 + r() * 30, 30 + r() * 20, 50 + r() * 40]);
        for (let wy = horizon - h + 14; wy < horizon - 20; wy += 34) {
          for (let wx = x + 10; wx < x + W * 0.12 - 20; wx += 30)
            if (r() > 0.4) canvas.rect(wx, wy, 12, 16, [255, 200, 110]);
        }
      }
      const awnings: Rgb[] = [
        [220, 50, 70],
        [250, 180, 40],
        [40, 160, 120],
        [60, 120, 220],
      ];
      for (let x = 0; x < W; x += W * 0.2) {
        const c = awnings[Math.floor(r() * awnings.length)] as Rgb;
        for (let s = 0; s < 8; s++)
          canvas.rect(
            x + s * (W * 0.025),
            horizon + H * 0.05,
            W * 0.025,
            H * 0.05,
            s % 2 ? c : [250, 246, 236],
          );
        canvas.rect(x + W * 0.02, horizon + H * 0.1, W * 0.16, H * 0.12, [90, 64, 48]);
      }
      // Strings of lights.
      for (let line = 0; line < 3; line++) {
        const y0 = H * (0.12 + line * 0.1);
        for (let x = 0; x < W; x += 22) {
          const y = y0 + Math.sin((x / W) * Math.PI) * H * 0.08;
          const colours: Rgb[] = [
            [255, 220, 120],
            [255, 120, 120],
            [140, 230, 160],
          ];
          canvas.circle(x, y, 5, colours[((x / 22 + line) % 3) | 0] as Rgb);
          canvas.circle(x, y, 12, [255, 230, 160], 0.12);
        }
      }
      break;
    }
    case 'bluecity': {
      canvas.below(
        (x) => horizon - H * 0.25 + H * 0.05 * Math.cos(x / (W * 0.15)),
        () => [150, 112, 80],
      );
      canvas.rect(W * 0.35, horizon - H * 0.4, W * 0.3, H * 0.12, [168, 120, 84]);
      for (let row = 0; row < 4; row++) {
        for (let x = -20; x < W; x += W * (0.06 + r() * 0.04)) {
          const w = W * (0.05 + r() * 0.05);
          const h = H * (0.07 + r() * 0.06);
          const y = horizon - H * 0.12 + row * H * 0.09;
          const blue: Rgb = mix([70, 120, 200], [150, 190, 235], r());
          canvas.rect(x, y, w, h + H * 0.1, blue);
          canvas.rect(x + w * 0.3, y + h * 0.35, w * 0.25, h * 0.35, [40, 50, 80]);
        }
      }
      break;
    }
    case 'airport': {
      canvas.below(
        () => horizon,
        (_x, y) => mix([120, 124, 128], [70, 72, 76], (y - horizon) / (H - horizon)),
      );
      for (let x = 0; x < W; x += W * 0.08)
        canvas.rect(x, horizon + H * 0.2, W * 0.04, H * 0.012, [240, 240, 240]);
      const py = horizon - H * 0.05;
      canvas.rect(W * 0.25, py - H * 0.03, W * 0.5, H * 0.06, [246, 246, 250]);
      canvas.circle(W * 0.75, py, H * 0.03, [246, 246, 250]);
      canvas.rect(W * 0.38, py - H * 0.01, W * 0.14, H * 0.12, [226, 230, 238]);
      canvas.rect(W * 0.25, py - H * 0.14, W * 0.05, H * 0.12, [200, 40, 60]);
      for (let x = W * 0.33; x < W * 0.7; x += W * 0.025)
        canvas.circle(x, py - H * 0.005, H * 0.008, [60, 90, 130]);
      break;
    }
    case 'beach': {
      canvas.rect(0, horizon, W, H * 0.12, [40, 130, 170]);
      canvas.below(
        () => horizon + H * 0.12,
        () => [240, 214, 160],
      );
      const tx = W * 0.2;
      for (let i = 0; i < 40; i++)
        canvas.circle(tx + i * 2, horizon + H * 0.3 - i * H * 0.012, W * 0.012, [110, 80, 50]);
      for (let a = 0; a < 7; a++) {
        const ang = Math.PI * (0.1 + a * 0.13);
        for (let t = 0; t < 1; t += 0.01) {
          canvas.circle(
            tx + 80 + Math.cos(ang) * t * W * 0.12,
            horizon - H * 0.17 - Math.sin(ang) * t * H * 0.1 + t * t * H * 0.1,
            W * 0.006,
            [40, 120, 60],
          );
        }
      }
      break;
    }
  }
}

function paintTicket(canvas: Canvas, r: () => number) {
  const W = canvas.width;
  const H = canvas.height;
  canvas.rect(0, 0, W, H, [242, 243, 246]);
  canvas.rect(0, 0, W, H * 0.05, [255, 255, 255]);
  canvas.text('9:41', W * 0.05, H * 0.015, Math.round(W / 220), [20, 20, 20]);
  canvas.rect(W * 0.06, H * 0.1, W * 0.88, H * 0.62, [255, 255, 255]);
  canvas.rect(W * 0.06, H * 0.1, W * 0.88, H * 0.1, [36, 72, 160]);
  const s = Math.round(W / 140);
  canvas.text('E-TICKET', W * 0.1, H * 0.13, s, [255, 255, 255]);
  canvas.text('DEL - JAI', W * 0.1, H * 0.25, s * 1.3, [30, 30, 40]);
  canvas.text('14 NOV  06:05', W * 0.1, H * 0.34, s, [90, 90, 100]);
  canvas.text('SEAT 12A', W * 0.1, H * 0.42, s, [90, 90, 100]);
  for (let x = W * 0.12; x < W * 0.88; x += 4 + Math.floor(r() * 10)) {
    canvas.rect(x, H * 0.52, 2 + Math.floor(r() * 4), H * 0.14, [20, 20, 20]);
  }
}

// ---------- A 5×7 pixel font ----------

const GLYPHS = `
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .###. #...# #.... #.... #.... #...# .###.
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .###. #...# #.... #.### #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I .###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.
J ..### ...#. ...#. ...#. ...#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# ##..# #.#.# #..## #...# #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# #.#.# .#.#.
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 ..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.
2 .###. #...# ....# ...#. ..#.. .#... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 ...#. ..##. .#.#. #..#. ##### ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 .###. #.... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. .#... .#... .#...
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .####. ....# ....# .###.
. ..... ..... ..... ..... ..... .##.. .##..
, ..... ..... ..... ..... .##.. ..#.. .#...
: ..... .##.. .##.. ..... .##.. .##.. .....
- ..... ..... ..... ##### ..... ..... .....
+ ..... ..#.. ..#.. ##### ..#.. ..#.. .....
( ...#. ..#.. .#... .#... .#... ..#.. ...#.
) .#... ..#.. ...#. ...#. ...#. ..#.. .#...
/ ....# ...#. ...#. ..#.. .#... .#... #....
· ..... ..... ..... ..#.. ..... ..... .....
! ..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..
? .###. #...# ....# ...#. ..#.. ..... ..#..
' ..#.. ..#.. .#... ..... ..... ..... .....
" .#.#. .#.#. .#.#. ..... ..... ..... .....
& .##.. #..#. .##.. .#... #.#.# #..#. .##.#
> .#... ..#.. ...#. ....# ...#. ..#.. .#...
= ..... ..... ##### ..... ##### ..... .....
`;

const FONT: Record<string, string[]> = { ' ': Array(7).fill('.....') };
for (const line of GLYPHS.trim().split('\n')) {
  const [ch, ...rows] = line.split(' ');
  if (ch) FONT[ch] = rows.map((row) => row.slice(0, 5));
}
