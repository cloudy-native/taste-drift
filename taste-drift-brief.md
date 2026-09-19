# Taste-Drift: Browser-Based T2I Prompt Generator

**Type:** Project brief
**Status:** Draft v0.1
**Audience:** Adults (18+) generating prompts for text-to-image models

---

## 1. Summary

A fully client-side prompt generator for adult (NSFW) text-to-image work. Instead of a static form or dropdown builder, the tool **learns the user's preferences over time** from simple thumbs up/down feedback and gradually biases its output toward what they like. No server, no accounts, no telemetry. All data lives in the browser.

## 2. Goals

- Generate high-quality, varied prompts quickly, with minimal manual input.
- Adapt to individual taste through lightweight feedback ("taste drift").
- Run 100% in the browser, offline-capable, with zero data leaving the device.
- Export prompts in the dialect the target model expects.
- Keep content modular via user-editable, shareable "packs."

## 3. Non-Goals

- Not an image generator. It produces prompts only.
- No cloud sync, user accounts, or social/sharing backend.
- No content moderation service. Safety is enforced by design (see §7).
- No scraping or integration with third-party image sites in v1.

## 4. Core Concept

Prompts are assembled from a **grammar of slots** (subject, setting, lighting, camera, wardrobe, mood, style, etc.). Each slot value is a **chip** with a weight. Feedback adjusts chip weights, so future rolls sample from a distribution shaped by the user's taste.

## 5. Features

### 5.1 Grammar Engine
- Tracery-style recursive grammar defined in JSON.
- Supports nested rules, conditional tags (e.g. `indoor` chips only pair with indoor lighting), and mutual-exclusion groups.
- Deterministic seeds so a roll can be reproduced or shared.

### 5.2 Chip UI with Slot Locks
- Each roll renders as editable chips grouped by slot.
- **Lock** any chip to keep it; **reroll** everything else.
- Click a chip to swap it, edit it, or ban it.

### 5.3 Taste Learning
- 👍 / 👎 on a roll updates the weight of every chip in it.
- Algorithm: per-chip Beta-distribution **Thompson sampling** (multi-armed bandit) with a small exploration floor so the generator never collapses into a rut.
- Pairwise co-occurrence bonus (optional v2) so combinations, not just individual chips, are learned.
- "Drift" slider: controls exploration vs. exploitation.
- Full reset and per-pack reset available.

### 5.4 Dialect Export
One prompt model, several output formats:

| Dialect | Target | Style |
|---|---|---|
| Tag | SDXL / Pony-style checkpoints | Weighted comma-separated tags, e.g. `(soft lighting:1.2)` |
| Natural | Flux-type / prose-driven models | Full sentences |
| Negative | Any | Auto-suggested negative prompt based on chosen style |

### 5.5 Packs
- Content lives in JSON packs (chips, weights, grammar rules, tags).
- Import/export via file or paste. Packs are versioned and namespaced to avoid collisions.
- Ships with a small starter pack.

### 5.6 Optional Local LLM Expansion
- Opt-in, in-browser model (WebLLM or transformers.js) rewrites the chip list into flowing prose.
- Runs entirely offline after the initial model download; disabled by default due to size.

## 6. Technical Approach

| Concern | Choice |
|---|---|
| Delivery | Static site / single-page app, no backend |
| Framework | Vanilla JS or Svelte/Preact (small bundle) |
| Storage | IndexedDB for weights, history, packs; `localStorage` for UI prefs only |
| Randomness | Seeded PRNG (e.g. mulberry32) for reproducibility |
| Offline | Service worker + PWA manifest |
| LLM (optional) | WebLLM (WebGPU) with transformers.js fallback |
| Hosting | Any static host; can also run from a local file |

### Data Model (sketch)

```json
{
  "pack": "starter",
  "version": 1,
  "slots": {
    "lighting": [
      { "id": "l_001", "text": "soft window light", "tags": ["indoor"], "w": { "a": 1, "b": 1 } }
    ]
  },
  "rules": [
    { "if": "outdoor", "exclude": ["studio backdrop"] }
  ]
}
```

`w.a` / `w.b` are the Beta-distribution success/failure counts updated by feedback.

## 7. Safety and Guardrails (Design-Level)

Safety is built into the content model rather than filtered after the fact.

- **Adults only:** every subject slot explicitly specifies an adult. No age-ambiguous, youthful-coded, or minor-related chips exist in the starter pack.
- **Pack validation:** imported packs are scanned on load. Packs containing banned terms or age-ambiguous descriptors are rejected with an explanation.
- **No real people:** no named individuals or celebrity likeness slots.
- **No non-consensual scenarios:** no chips or rules that produce them.
- **Local-only:** no telemetry, no external requests after load.
- **Age gate:** simple 18+ confirmation on first run.

Validation on import is a hard requirement, since user-supplied packs are the main way the guardrails could be bypassed.

## 8. MVP Scope (v0.1)

- [ ] Grammar engine with slots, tags, and exclusions
- [ ] Chip UI with lock and reroll
- [ ] 👍/👎 feedback with Thompson-sampling weights in IndexedDB
- [ ] Tag and Natural dialect export, plus negative prompt suggestions
- [ ] Pack import/export with validation
- [ ] Starter pack (~150–250 chips across ~10 slots)
- [ ] Copy-to-clipboard and history list (last 100 rolls)

**Deferred:** local LLM expansion, co-occurrence learning, PWA offline install, pack sharing UX.

## 9. Milestones

| Phase | Deliverable |
|---|---|
| M1 | Grammar engine + chip UI (no learning) |
| M2 | Feedback loop + persisted weights + drift slider |
| M3 | Dialect export + negative prompts |
| M4 | Pack import/export + validation |
| M5 | PWA/offline + optional local LLM expansion |

## 10. Risks and Open Questions

- **Cold start:** with no feedback the tool is just random. Mitigation: seed weights with sensible priors and let users bulk-rate a "taste calibration" batch of ~10 rolls.
- **Overfitting:** the generator may narrow too fast. Mitigation: exploration floor and a visible drift control.
- **Feedback without seeing the image:** ratings are on the prompt, but the real outcome depends on the model. Consider letting users paste a result rating after generating.
- **Local LLM weight:** model download size may be prohibitive on mobile. Keep it strictly opt-in.
- **Pack validation coverage:** a keyword list will miss things; consider a small in-browser classifier as a second pass.
- **Dialect drift:** model-specific syntax changes over time. Keep dialects as data-driven templates, not hard-coded logic.

## 11. Success Criteria

- Generates a usable prompt in under 100 ms without the LLM.
- After ~30 rated rolls, users report noticeably better hit rate versus pure random.
- Works fully offline; zero network requests after initial load.
- Imported packs that violate guardrails are reliably rejected.
