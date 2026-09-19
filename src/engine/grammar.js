import { mulberry32 } from './prng.js'
import { thompsonPick, prior } from './sampling.js'

export function expand(text, fragments, rng) {
  return text.replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const opts = fragments?.[key]
    if (!opts?.length) return `{${key}}`
    return opts[Math.floor(rng() * opts.length)]
  })
}

function tagSet(selected) {
  const tags = new Set()
  for (const item of Object.values(selected)) {
    for (const t of item.chip.tags || []) tags.add(t)
  }
  return tags
}

function allowed(chip, tags, rules) {
  if (chip.requires?.some((t) => !tags.has(t))) return false
  if (chip.forbids?.some((t) => tags.has(t))) return false
  for (const rule of rules || []) {
    if (rule.ifTag && tags.has(rule.ifTag)) {
      if (rule.forbidTags?.some((t) => chip.tags?.includes(t))) return false
      if (rule.exclude?.includes(chip.id) || rule.exclude?.includes(chip.text)) return false
    }
    if (rule.mutex) {
      const hit = rule.mutex.filter((t) => tags.has(t))
      if (hit.length && chip.tags?.some((t) => rule.mutex.includes(t) && !hit.includes(t))) {
        return false
      }
    }
  }
  return true
}

export function roll(pack, opts) {
  const {
    seed,
    locked = {},
    banned = new Set(),
    weights = {},
    drift = 0.2,
  } = opts
  const rng = mulberry32(seed)
  const selected = { ...locked }
  const order = pack.slotOrder || Object.keys(pack.slots)

  for (const slot of order) {
    if (selected[slot]) continue
    const tags = tagSet(selected)
    const pool = pack.slots[slot] || []
    let candidates = pool.filter((c) => !banned.has(c.id) && allowed(c, tags, pack.rules))
    if (!candidates.length) {
      candidates = pool.filter((c) => !banned.has(c.id))
    }
    if (!candidates.length) continue
    const ws = candidates.map((c) => weights[c.id] || c.w || prior())
    const i = thompsonPick(ws, rng, drift)
    const chip = candidates[i]
    selected[slot] = {
      slot,
      chip,
      text: expand(chip.text, pack.fragments, rng),
    }
  }

  return { seed, selected }
}

export function slotsOf(pack) {
  return pack.slotOrder || Object.keys(pack.slots)
}

export function alternatives(pack, slot, selected, banned) {
  const tags = tagSet(
    Object.fromEntries(Object.entries(selected).filter(([s]) => s !== slot)),
  )
  const pool = pack.slots[slot] || []
  let list = pool.filter((c) => !banned.has(c.id) && allowed(c, tags, pack.rules))
  if (!list.length) list = pool.filter((c) => !banned.has(c.id))
  return list
}
