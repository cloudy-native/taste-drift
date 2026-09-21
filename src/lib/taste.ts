import { mean } from '../engine/sampling'
import type { CloudWord, Pack, TasteWord, WeightMap } from '../types'

export function lookupChip(
  pack: Pack,
  id: string,
): { slot: string; text: string; chip: Pack['slots'][string][number] | null } {
  for (const [slot, chips] of Object.entries(pack.slots || {})) {
    const chip = chips.find((c) => c.id === id)
    if (chip) {
      const text = chip.text.replace(/\{([a-z0-9_]+)\}/gi, (_, k: string) =>
        k.replace(/_/g, ' '),
      )
      return { slot, text, chip }
    }
  }
  return { slot: '', text: id, chip: null }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function splitTaste(
  pack: Pack,
  weights: WeightMap,
  banned: Set<string> = new Set(),
): { pos: TasteWord[]; neg: TasteWord[] } {
  const pos: TasteWord[] = []
  const neg: TasteWord[] = []
  const seen = new Set<string>()

  for (const [id, w] of Object.entries(weights || {})) {
    const ups = (w.a ?? 2) - 2
    const downs = (w.b ?? 2) - 2
    if (ups === 0 && downs === 0) continue
    const { slot, text } = lookupChip(pack, id)
    const item: TasteWord = {
      id,
      slot,
      text,
      ups,
      downs,
      score: mean(w),
      mag: Math.abs(ups - downs) + Math.max(ups, downs),
      banned: banned.has(id),
    }
    seen.add(id)
    if (ups > downs) pos.push(item)
    else if (downs > ups) neg.push(item)
  }

  for (const id of banned) {
    if (seen.has(id)) {
      const hit = neg.find((x) => x.id === id) || pos.find((x) => x.id === id)
      if (hit) hit.banned = true
      continue
    }
    const { slot, text } = lookupChip(pack, id)
    neg.push({
      id,
      slot,
      text,
      ups: 0,
      downs: 0,
      score: 0,
      mag: 3,
      banned: true,
    })
  }

  return { pos, neg }
}

export function cloudify(items: TasteWord[]): CloudWord[] {
  const max = Math.max(1, ...items.map((i) => i.mag || 1))
  return [...items]
    .sort((a, b) => b.mag - a.mag)
    .map((i, idx) => ({
      ...i,
      size: 0.7 + (i.mag / max) * 1.45,
      rot: (hash(i.id) % 13) - 6,
      delay: (hash(i.id + 't') % 20) / 10,
      idx,
    }))
}
