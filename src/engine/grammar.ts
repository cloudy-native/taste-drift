import type { Chip, Pack, PackRule, Rng, RollResult, Selection, WeightMap } from '../types'
import { mulberry32 } from './prng'
import { prior, thompsonPick } from './sampling'

export function expand(text: string, fragments: Record<string, string[]> | undefined, rng: Rng): string {
  return text.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) => {
    const opts = fragments?.[key]
    if (!opts?.length) return `{${key}}`
    return opts[Math.floor(rng() * opts.length)]
  })
}

function tagSet(selected: Selection): Set<string> {
  const tags = new Set<string>()
  for (const item of Object.values(selected)) {
    for (const t of item.chip.tags || []) tags.add(t)
  }
  return tags
}

export function chipHeat(chip: Chip): number {
  if (typeof chip?.x === 'number') return chip.x
  if (chip?.tags?.includes('nude')) return 2
  return 0
}

function heatOk(chip: Chip, heat: number): boolean {
  return chipHeat(chip) <= heat
}

function allowed(chip: Chip, tags: Set<string>, rules: PackRule[] | undefined): boolean {
  if (chip.requires?.some((t) => !tags.has(t))) return false
  if (chip.forbids?.some((t) => tags.has(t))) return false
  for (const rule of rules || []) {
    if (rule.ifTag && tags.has(rule.ifTag)) {
      if (rule.forbidTags?.some((t) => chip.tags?.includes(t))) return false
      if (rule.exclude?.includes(chip.id) || rule.exclude?.includes(chip.text)) return false
    }
    if (rule.mutex) {
      const hit = rule.mutex.filter((t) => tags.has(t))
      if (hit.length && chip.tags?.some((t) => rule.mutex!.includes(t) && !hit.includes(t))) {
        return false
      }
    }
  }
  return true
}

export interface RollOpts {
  seed: number
  locked?: Selection
  banned?: Set<string>
  weights?: WeightMap
  drift?: number
  heat?: number
}

export function roll(pack: Pack, opts: RollOpts): RollResult {
  const {
    seed,
    locked = {},
    banned = new Set<string>(),
    weights = {},
    drift = 0.2,
    heat = 2,
  } = opts
  const rng = mulberry32(seed)
  const selected: Selection = { ...locked }
  const order = pack.slotOrder || Object.keys(pack.slots)

  for (const slot of order) {
    if (selected[slot]) continue
    const tags = tagSet(selected)
    const pool = pack.slots[slot] || []
    let candidates = pool.filter(
      (c) => !banned.has(c.id) && heatOk(c, heat) && allowed(c, tags, pack.rules),
    )
    if (!candidates.length) {
      candidates = pool.filter((c) => !banned.has(c.id) && heatOk(c, heat))
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

export function slotsOf(pack: Pack): string[] {
  return pack.slotOrder || Object.keys(pack.slots)
}

export function alternatives(
  pack: Pack,
  slot: string,
  selected: Selection,
  banned: Set<string>,
  heat = 2,
): Chip[] {
  const tags = tagSet(
    Object.fromEntries(Object.entries(selected).filter(([s]) => s !== slot)),
  )
  const pool = pack.slots[slot] || []
  let list = pool.filter(
    (c) => !banned.has(c.id) && heatOk(c, heat) && allowed(c, tags, pack.rules),
  )
  if (!list.length) list = pool.filter((c) => !banned.has(c.id) && heatOk(c, heat))
  return list
}
