/** Marsaglia–Tsang gamma (shape ≥ 1); boost for shape < 1. */
function gaussian(rng) {
  const u = rng() || 1e-12
  const v = rng() || 1e-12
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function gammaSample(shape, rng) {
  if (shape < 1) {
    const u = rng() || 1e-12
    return gammaSample(shape + 1, rng) * u ** (1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x
    let v
    do {
      x = gaussian(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function betaSample(a, b, rng) {
  const x = gammaSample(Math.max(a, 1e-3), rng)
  const y = gammaSample(Math.max(b, 1e-3), rng)
  const s = x + y
  return s > 0 ? x / s : 0.5
}

/**
 * Pick an index. `drift` 0 = exploit (Thompson), 1 = explore (uniform).
 * Always keeps a small exploration floor so the bandit cannot collapse.
 */
export function thompsonPick(weights, rng, drift = 0.2, floor = 0.08) {
  const n = weights.length
  if (n === 0) return -1
  if (n === 1) return 0
  const mix = Math.min(1, Math.max(0, floor + drift * (1 - floor)))
  if (rng() < mix) return Math.floor(rng() * n)
  let best = 0
  let bestS = -1
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    const s = betaSample(w.a, w.b, rng)
    if (s > bestS) {
      bestS = s
      best = i
    }
  }
  return best
}

export function applyFeedback(w, liked) {
  return liked ? { a: w.a + 1, b: w.b } : { a: w.a, b: w.b + 1 }
}

export function prior() {
  return { a: 2, b: 2 }
}

export function mean(w) {
  return w.a / (w.a + w.b)
}
