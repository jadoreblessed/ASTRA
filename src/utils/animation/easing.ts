/**
 * `cubic-bezier()` as a plain easing function, for passing to react-spring's
 * `config.easing`.
 *
 * The original helios build expressed its reveals as CSS transitions with
 * bespoke bezier curves. Those transitions are gone — motion is spring-based —
 * but the curves are kept so the rebuilt reveals land on the same timing.
 */

/** Newton-Raphson iterations; 4 is enough for sub-pixel accuracy over 0..1. */
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;

const A = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1;
const B = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1;
const C = (a1: number) => 3.0 * a1;

/** Evaluate the bezier polynomial at `t`. */
const calcBezier = (t: number, a1: number, a2: number) =>
  ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;

/** Derivative of the bezier polynomial at `t`. */
const getSlope = (t: number, a1: number, a2: number) =>
  3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);

const binarySubdivide = (x: number, a: number, b: number, x1: number, x2: number) => {
  let currentX: number;
  let currentT: number;
  let i = 0;
  do {
    currentT = a + (b - a) / 2.0;
    currentX = calcBezier(currentT, x1, x2) - x;
    if (currentX > 0.0) b = currentT;
    else a = currentT;
  } while (
    Math.abs(currentX) > SUBDIVISION_PRECISION &&
    ++i < SUBDIVISION_MAX_ITERATIONS
  );
  return currentT;
};

const newtonRaphsonIterate = (x: number, guessT: number, x1: number, x2: number) => {
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const currentSlope = getSlope(guessT, x1, x2);
    if (currentSlope === 0.0) return guessT;
    const currentX = calcBezier(guessT, x1, x2) - x;
    guessT -= currentX / currentSlope;
  }
  return guessT;
};

/**
 * Build an easing function equivalent to CSS `cubic-bezier(x1, y1, x2, y2)`.
 * Control-point x values must lie in [0, 1] for the curve to be a function.
 */
export const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ((t: number) => number) => {
  if (x1 === y1 && x2 === y2) return (t) => t;

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    // Solve x(tGuess) = t for tGuess, then evaluate y at it.
    let intervalStart = 0.0;
    let currentSample = 1;
    const sampleCount = 11;
    const sampleStep = 1.0 / (sampleCount - 1);
    const samples: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      samples.push(calcBezier(i * sampleStep, x1, x2));
    }

    for (
      ;
      currentSample !== sampleCount - 1 && samples[currentSample] <= t;
      ++currentSample
    ) {
      intervalStart += sampleStep;
    }
    --currentSample;

    const dist =
      (t - samples[currentSample]) /
      (samples[currentSample + 1] - samples[currentSample]);
    const guessForT = intervalStart + dist * sampleStep;
    const initialSlope = getSlope(guessForT, x1, x2);

    let tGuess: number;
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      tGuess = newtonRaphsonIterate(t, guessForT, x1, x2);
    } else if (initialSlope === 0.0) {
      tGuess = guessForT;
    } else {
      tGuess = binarySubdivide(
        t,
        intervalStart,
        intervalStart + sampleStep,
        x1,
        x2,
      );
    }
    return calcBezier(tGuess, y1, y2);
  };
};

/** The original's reveal curve — a gentle deceleration. */
export const easeReveal = cubicBezier(0.16, 0.77, 0.3, 1);

/** The original's quartic ease-out, used by the Sitemap sequence. */
export const easeOutQuartic = (t: number) => 1 - Math.pow(1 - t, 4);
