# Taste-Drift

A fully client-side prompt generator for adult (18+) text-to-image work. It learns your taste from thumbs up/down and biases future rolls. No server, no accounts, no telemetry.

See [taste-drift-brief.md](./taste-drift-brief.md).

## Stack

**Svelte 5 + Vite + TypeScript.** Static SPA. IndexedDB for weights, history, and packs. `localStorage` for UI prefs only.

## Run

```bash
npm install
npm run dev
```

Typecheck: `npm run check`.

Build: `npm run build` then any static host.

## Use

1. Confirm you are 18+.
2. **Roll** a prompt. Lock chips you like, reroll the rest.
3. **Up / Down** updates per-chip Beta weights (Thompson sampling).
4. **Drift** mixes exploration vs exploitation.
5. Copy **Tag** (SDXL/Pony) or **Natural** (Flux/prose) plus a negative prompt.
6. Import/export JSON packs. Imports are rejected if they fail guardrails.

All data stays in this browser.
