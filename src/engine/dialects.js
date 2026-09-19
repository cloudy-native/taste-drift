import { mean } from './sampling.js'

const SLOT_JOIN = {
  subject: '',
  body: ', ',
  wardrobe: ', ',
  pose: ', ',
  setting: ', in ',
  lighting: ', ',
  camera: ', ',
  mood: ', ',
  style: ', ',
  extras: ', ',
}

export function toTag(selected, weights = {}) {
  const parts = []
  for (const { slot, text, chip } of Object.values(selected)) {
    if (!text) continue
    const w = weights[chip.id]
    const m = w ? mean(w) : 0.5
    const boost = 1 + (m - 0.5) * 0.6
    const rounded = Math.round(boost * 20) / 20
    if (rounded > 1.05 || rounded < 0.95) {
      parts.push(`(${text}:${rounded.toFixed(2)})`)
    } else {
      parts.push(text)
    }
    void slot
  }
  return parts.join(', ')
}

export function toNatural(selected) {
  const get = (s) => selected[s]?.text
  const subject = get('subject') || 'an adult'
  const body = get('body')
  const wardrobe = get('wardrobe')
  const pose = get('pose')
  const setting = get('setting')
  const lighting = get('lighting')
  const camera = get('camera')
  const mood = get('mood')
  const style = get('style')
  const extras = get('extras')

  let s = subject
  if (body) s += `, ${body}`
  if (wardrobe) {
    s += selected.wardrobe?.chip.tags?.includes('nude')
      ? `, ${wardrobe}`
      : `, wearing ${wardrobe}`
  }
  if (pose) s += `, ${pose}`
  if (setting) s += `, ${setting}`
  s += '.'
  if (lighting) s += ` ${cap(lighting)}.`
  if (camera) s += ` ${cap(camera)}.`
  if (mood) s += ` ${cap(mood)} mood.`
  if (style) s += ` ${cap(style)}.`
  if (extras) s += ` ${cap(extras)}.`
  return s
}

function cap(t) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function toNegative(selected, pack) {
  const tags = new Set()
  for (const item of Object.values(selected)) {
    for (const t of item.chip.tags || []) tags.add(t)
  }
  const table = pack.negatives || {}
  if (tags.has('photo') && table.photo) return table.photo
  if (tags.has('illustration') && table.illustration) return table.illustration
  if (tags.has('anime') && table.anime) return table.anime
  return table.default || 'low quality, blurry, watermark, text, extra limbs, deformed'
}

export function exportPrompt(dialect, selected, pack, weights) {
  if (dialect === 'natural') return toNatural(selected)
  if (dialect === 'negative') return toNegative(selected, pack)
  return toTag(selected, weights)
}

export { SLOT_JOIN }
