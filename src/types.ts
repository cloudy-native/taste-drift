export interface Beta {
  a: number
  b: number
}

export interface Chip {
  id: string
  text: string
  tags: string[]
  w: Beta
  x: number
  requires?: string[]
  forbids?: string[]
}

export interface PackRule {
  ifTag?: string
  forbidTags?: string[]
  exclude?: string[]
  mutex?: string[]
}

export interface Pack {
  pack: string
  version: number
  namespace?: string
  slotOrder?: string[]
  fragments?: Record<string, string[]>
  rules?: PackRule[]
  negatives?: Record<string, string>
  slots: Record<string, Chip[]>
  banned?: string[]
}

export interface SelectedChip {
  slot: string
  chip: Chip
  text: string
}

export type Selection = Record<string, SelectedChip>

export interface RollResult {
  seed: number
  selected: Selection
}

export type WeightMap = Record<string, Beta>

export type Dialect = 'tag' | 'natural' | 'negative'

export interface HistoryEntry {
  id?: number
  seed: number
  pack: string
  items: { slot: string; id: string; text: string }[]
  prompt: string
  ts: number
}

export interface Prefs {
  ageOk?: boolean
  drift?: number
  heat?: number
  dialect?: Dialect
  pack?: string
}

export interface TasteWord {
  id: string
  slot: string
  text: string
  ups: number
  downs: number
  score: number
  mag: number
  banned: boolean
}

export interface CloudWord extends TasteWord {
  size: number
  rot: number
  delay: number
  idx: number
}

export type Rng = () => number

export interface Snap {
  current: RollResult | null
  locked: Selection
  weights: WeightMap
  banned: string[]
  rated: 'up' | 'down' | null
  seedInput: string
}

export type Validation =
  | { ok: true }
  | { ok: false; error: string }
