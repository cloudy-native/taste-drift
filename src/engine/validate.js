const BANNED = [
  /\b(child|children|kid|kids|toddler|infant|baby|babies)\b/i,
  /\b(teen|teens|teenager|teenagers|underage|minor|minors)\b/i,
  /\b(under[\s-]?18|loli|lolita|shota|shotacon|lolicon)\b/i,
  /\b(young[\s-]?(girl|boy|looking|teen)|little[\s-]?(girl|boy))\b/i,
  /\b(schoolgirl|schoolboy|preteen|pre-teen|jailbait)\b/i,
  /\b(ped[oa]|childporn|cp\b)/i,
  /\b(youthful|barely[\s-]?legal|fresh[- ]faced girl)\b/i,
  /\b(non-?consensual|noncon|rape|raped|forced sex|unconscious|drugged)\b/i,
  /\b(bestiality|zoophilia|snuff)\b/i,
]

const SUBJECT_ADULT = /\b(adult|grown[- ]up)\b/i

function scan(text) {
  for (const re of BANNED) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return null
}

export function validatePack(pack) {
  if (!pack || typeof pack !== 'object') {
    return { ok: false, error: 'Pack is not a JSON object.' }
  }
  if (!pack.pack || typeof pack.pack !== 'string') {
    return { ok: false, error: 'Pack needs a "pack" name.' }
  }
  if (!pack.slots || typeof pack.slots !== 'object') {
    return { ok: false, error: 'Pack needs a "slots" object.' }
  }

  const names = Object.keys(pack.slots)
  if (!names.length) return { ok: false, error: 'Pack has no slots.' }

  for (const slot of names) {
    const chips = pack.slots[slot]
    if (!Array.isArray(chips)) {
      return { ok: false, error: `Slot "${slot}" is not an array.` }
    }
    for (const chip of chips) {
      if (!chip?.id || !chip?.text) {
        return { ok: false, error: `A chip in "${slot}" is missing id or text.` }
      }
      const hit = scan(chip.text) || scan(chip.id) || (chip.tags || []).map(scan).find(Boolean)
      if (hit) {
        return {
          ok: false,
          error: `Rejected: banned or age-ambiguous term “${hit}” in slot "${slot}" (${chip.id}).`,
        }
      }
      if (slot === 'subject' && !SUBJECT_ADULT.test(chip.text)) {
        return {
          ok: false,
          error: `Subject chip "${chip.id}" must explicitly describe an adult.`,
        }
      }
    }
  }

  for (const arr of Object.values(pack.fragments || {})) {
    for (const t of arr) {
      const hit = scan(t)
      if (hit) return { ok: false, error: `Rejected: banned term “${hit}” in fragments.` }
    }
  }

  return { ok: true }
}
