/**
 * ASTRA's planet — a Jupiter in the site's own colours: flat belts and zones of
 * blue, lilac and pale ice, and one pink storm. No gradients anywhere: every
 * band is a single flat colour, and depth comes from the particles (hero, logo
 * scene) or from nothing at all (the flat brand mark).
 *
 * Latitude `b` runs from 1 (north pole) to -1 (south pole). The same table feeds
 * the SVG mark, the hero's particle planet and (copied into GLSL) the closing
 * scene, so all three are one planet.
 */

export interface Band {
  /** Lower latitude edge of the band; it runs up to the previous band's edge. */
  from: number;
  color: string;
}

export const BANDS: Band[] = [
  { from: 0.78, color: "#2f4bff" },
  { from: 0.55, color: "#6d8bff" },
  { from: 0.36, color: "#e8edff" },
  { from: 0.16, color: "#4f6bff" },
  { from: -0.06, color: "#f4f6ff" },
  { from: -0.22, color: "#8f74ff" },
  { from: -0.44, color: "#e8edff" },
  { from: -0.6, color: "#5570ff" },
  { from: -0.8, color: "#b9a6ff" },
  { from: -1.01, color: "#2f4bff" },
];

/** The storm: a pink oval riding the pale southern zone. */
export const SPOT = { color: "#ff5fa8", lat: -0.33, lon: 0.9, w: 0.5, h: 0.095 } as const;

/** Index into `BANDS` for latitude `b`. */
export const bandAt = (b: number): number => {
  for (let i = 0; i < BANDS.length; i++) if (b >= BANDS[i].from) return i;
  return BANDS.length - 1;
};

/**
 * Flat band shapes for a planet of radius `r` centred at (`c`, `c`), as SVG path
 * data — each band is the slice of the disc between two latitudes (two chords
 * and two arcs), so the mark needs no clip-path and no gradient.
 */
export const bandPaths = (c: number, r: number): { d: string; color: string }[] => {
  const f = (v: number) => Number(v.toFixed(3));
  let top = 1;
  return BANDS.map((band) => {
    const lo = Math.max(-1, band.from);
    const ya = c - top * r;
    const yb = c - lo * r;
    const xa = Math.sqrt(Math.max(0, 1 - top * top)) * r;
    const xb = Math.sqrt(Math.max(0, 1 - lo * lo)) * r;
    top = lo;
    return {
      color: band.color,
      d:
        `M${f(c - xa)},${f(ya)} L${f(c + xa)},${f(ya)} ` +
        `A${r},${r} 0 0 1 ${f(c + xb)},${f(yb)} L${f(c - xb)},${f(yb)} ` +
        `A${r},${r} 0 0 1 ${f(c - xa)},${f(ya)} Z`,
    };
  });
};

/** Rotation speed per band, rad/s — neighbours differ, so the belts shear. */
export const BAND_SPEED = BANDS.map(
  (_, i) => 0.16 + (i % 2 === 0 ? 0.03 : -0.02) + Math.sin(i * 1.7) * 0.012,
);

const glslVec3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => (v / 255).toFixed(4);
  return `vec3(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};
const glslFloat = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/**
 * The band table as GLSL — `bandColor(b)`, `bandSpeed(b)` and the storm's
 * constants — so the WebGL planet is built from the same numbers as the rest.
 */
export const PLANET_GLSL = [
  "vec3 bandColor(float b) {",
  ...BANDS.slice(0, -1).map((band) => `  if (b >= ${glslFloat(band.from)}) return ${glslVec3(band.color)};`),
  `  return ${glslVec3(BANDS[BANDS.length - 1].color)};`,
  "}",
  "float bandSpeed(float b) {",
  ...BANDS.slice(0, -1).map((band, i) => `  if (b >= ${glslFloat(band.from)}) return ${BAND_SPEED[i].toFixed(4)};`),
  `  return ${BAND_SPEED[BANDS.length - 1].toFixed(4)};`,
  "}",
  `const vec3 SPOT_COL = ${glslVec3(SPOT.color)};`,
  `const float SPOT_LAT = ${glslFloat(SPOT.lat)};`,
  `const float SPOT_LON = ${glslFloat(SPOT.lon)};`,
  `const float SPOT_W = ${glslFloat(SPOT.w)};`,
  `const float SPOT_H = ${glslFloat(SPOT.h)};`,
].join("\n");
