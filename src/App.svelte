<script lang="ts">
  import { onMount } from 'svelte'
  import AgeGate from './lib/AgeGate.svelte'
  import Chip from './lib/Chip.svelte'
  import SwapList from './lib/SwapList.svelte'
  import PackModal from './lib/PackModal.svelte'
  import TastePanel from './lib/TastePanel.svelte'
  import WordCloud from './lib/WordCloud.svelte'
  import { splitTaste } from './lib/taste'
  import { starter, chipCount } from './packs/starter'
  import { roll, alternatives, slotsOf, expand } from './engine/grammar'
  import { exportPrompt } from './engine/dialects'
  import { applyFeedback, prior, thompsonPick } from './engine/sampling'
  import { mulberry32, randomSeed } from './engine/prng'
  import { validatePack } from './engine/validate'
  import * as db from './storage/db'
  import type {
    Chip as ChipT,
    Dialect,
    HistoryEntry,
    Pack,
    RollResult,
    SelectedChip,
    Selection,
    Snap,
    WeightMap,
  } from './types'

  let ageOk = $state(false)
  let pack = $state<Pack>(starter)
  let packList = $state<Pack[]>([])
  let weights = $state<WeightMap>({})
  let banned = $state(new Set<string>())
  let locked = $state<Selection>({})
  let drift = $state(0.25)
  let heat = $state(2)
  let dialect = $state<Dialect>('tag')
  let seedInput = $state('')
  let current = $state<RollResult | null>(null)
  let history = $state<HistoryEntry[]>([])
  let rated = $state<'up' | 'down' | null>(null)
  let swapSlot = $state<string | null>(null)
  let packOpen = $state(false)
  let packErr = $state('')
  let copied = $state('')
  let showHistory = $state(false)
  let showTaste = $state(false)
  let menuSlot = $state<string | null>(null)
  let toast = $state('')
  let past = $state<Snap[]>([])
  let future = $state<Snap[]>([])
  let storeSeq = 0

  const nChips = $derived(chipCount(pack))
  const prompt = $derived(
    current ? exportPrompt(dialect, current.selected, pack, weights) : '',
  )
  const negative = $derived(
    current ? exportPrompt('negative', current.selected, pack, weights) : '',
  )
  const order = $derived(slotsOf(pack))
  const items = $derived(
    order.map((s) => current?.selected[s]).filter((x): x is SelectedChip => !!x),
  )
  const clouds = $derived(splitTaste(pack, weights, banned))
  const hasTaste = $derived(clouds.pos.length + clouds.neg.length > 0)
  const canUndo = $derived(past.length > 0)
  const canRedo = $derived(future.length > 0)
  const driftLabel = $derived(
    drift < 0.35 ? 'stick to taste' : drift > 0.65 ? 'wander' : 'mix',
  )
  const heatNames = ['suggestive', 'sensual', 'nude', 'explicit']
  const heatLabel = $derived(heatNames[heat] ?? 'nude')

  async function boot() {
    const prefs = db.getPrefs()
    ageOk = !!prefs.ageOk
    drift = prefs.drift ?? 0.25
    heat = prefs.heat ?? 2
    dialect = prefs.dialect === 'natural' ? 'natural' : 'tag'
    banned = await db.getBanned()
    history = await db.listHistory()
    const stored = await db.listPacks()
    packList = [starter, ...stored.filter((p) => p.pack !== 'starter')]
    if (prefs.pack && packList.some((p) => p.pack === prefs.pack)) {
      pack = packList.find((p) => p.pack === prefs.pack) ?? pack
    }
    weights = await db.getWeights(pack.pack)
    if (ageOk) generate(false, undefined, false)
  }

  onMount(() => {
    void boot()

    function onPointerDown(e: PointerEvent) {
      if ((e.target as Element | null)?.closest('[data-chip]')) return
      menuSlot = null
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') menuSlot = null
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (e.key === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  })

  function flash(msg: string) {
    toast = msg
    setTimeout(() => {
      if (toast === msg) toast = ''
    }, 1600)
  }

  function toggleMenu(slot: string, force?: boolean) {
    if (force === false) {
      menuSlot = null
      return
    }
    menuSlot = menuSlot === slot ? null : slot
  }

  function confirmAge() {
    ageOk = true
    db.setPrefs({ ageOk: true })
    generate(false, undefined, false)
  }

  function snap(): Snap {
    return JSON.parse(
      JSON.stringify({
        current,
        locked,
        weights,
        banned: [...banned],
        rated,
        seedInput,
      }),
    ) as Snap
  }

  function checkpoint() {
    past = [...past, snap()].slice(-50)
    future = []
  }

  function applySnap(s: Snap) {
    current = s.current
    locked = s.locked || {}
    weights = s.weights || {}
    banned = new Set(s.banned || [])
    rated = s.rated
    seedInput = s.seedInput
    persistStores(s)
  }

  async function persistStores(s: Snap) {
    const n = ++storeSeq
    await db.resetWeights(pack.pack)
    if (n !== storeSeq) return
    for (const [id, w] of Object.entries(s.weights || {})) {
      await db.setWeight(pack.pack, id, w)
    }
    if (n !== storeSeq) return
    await db.clearBanned()
    if (n !== storeSeq) return
    for (const id of s.banned || []) await db.banChip(id)
  }

  function undo() {
    if (!past.length) return
    const prev = past[past.length - 1]
    past = past.slice(0, -1)
    future = [...future, snap()]
    applySnap(prev)
  }

  function redo() {
    if (!future.length) return
    const next = future[future.length - 1]
    future = future.slice(0, -1)
    past = [...past, snap()]
    applySnap(next)
  }

  function generate(keepLocks: boolean, seed?: number, record = true) {
    if (record && current) checkpoint()
    const s = seed ?? randomSeed()
    seedInput = s.toString(16)
    current = roll(pack, {
      seed: s,
      locked: keepLocks ? locked : {},
      banned,
      weights,
      drift,
      heat,
    })
    if (!keepLocks) locked = {}
    rated = null
    persistHistory(current)
  }

  function rerollUnlocked() {
    generate(true)
  }

  async function persistHistory(snapshot: RollResult | null) {
    if (!snapshot) return
    const selected = snapshot.selected
    const entry = {
      seed: snapshot.seed,
      pack: pack.pack,
      items: Object.values(selected).map((i) => ({
        slot: i.slot,
        id: i.chip.id,
        text: i.text,
      })),
      prompt: exportPrompt(dialect, selected, pack, weights),
      ts: Date.now(),
    }
    await db.addHistory(entry)
    history = await db.listHistory()
  }

  function toggleLock(slot: string) {
    checkpoint()
    if (locked[slot]) {
      const next = { ...locked }
      delete next[slot]
      locked = next
    } else if (current?.selected[slot]) {
      locked = { ...locked, [slot]: current.selected[slot] }
    }
  }

  function applySwap(chip: ChipT) {
    if (!swapSlot || !current) return
    checkpoint()
    const slot = swapSlot
    const rng = mulberry32((current.seed ^ slot.length * 997) >>> 0)
    const item = { slot, chip, text: expand(chip.text, pack.fragments, rng) }
    current = { ...current, selected: { ...current.selected, [slot]: item } }
    if (locked[slot]) locked = { ...locked, [slot]: item }
    swapSlot = null
  }

  function editChip(slot: string, text: string) {
    if (!current?.selected[slot]) return
    checkpoint()
    const item = { ...current.selected[slot], text }
    current = { ...current, selected: { ...current.selected, [slot]: item } }
    if (locked[slot]) locked = { ...locked, [slot]: item }
  }

  async function ban(slot: string) {
    if (!current?.selected[slot]) return
    checkpoint()
    const id = current.selected[slot].chip.id
    await db.banChip(id)
    const nextBanned = new Set([...banned, id])
    banned = nextBanned
    const nextLocked = { ...locked }
    delete nextLocked[slot]
    locked = nextLocked

    const alts = alternatives(pack, slot, current.selected, nextBanned, heat)
    if (!alts.length) {
      const selected = { ...current.selected }
      delete selected[slot]
      current = { ...current, selected }
      return
    }
    const rng = mulberry32((current.seed ^ (slot.length + 1) * 997) >>> 0)
    const i = thompsonPick(
      alts.map((c) => weights[c.id] || c.w || prior()),
      rng,
      drift,
    )
    const chip = alts[i]
    if (!chip) return
    const item = { slot, chip, text: expand(chip.text, pack.fragments, rng) }
    current = { ...current, selected: { ...current.selected, [slot]: item } }
  }

  async function rate(liked: boolean) {
    if (!current || rated) return
    checkpoint()
    rated = liked ? 'up' : 'down'
    const next = { ...weights }
    for (const item of Object.values(current.selected)) {
      const w = next[item.chip.id] || item.chip.w || prior()
      next[item.chip.id] = applyFeedback(w, liked)
      await db.setWeight(pack.pack, item.chip.id, next[item.chip.id])
    }
    weights = next
  }

  async function copy(which: 'p' | 'neg') {
    const text = which === 'neg' ? negative : prompt
    await navigator.clipboard.writeText(text)
    copied = which
    setTimeout(() => (copied = ''), 1200)
  }

  function applySeed() {
    const n = parseInt(seedInput.trim(), 16)
    if (!Number.isFinite(n)) return
    const s = n >>> 0
    if (current && s === current.seed) return
    generate(true, s)
  }

  async function resetTaste() {
    try {
      checkpoint()
      await db.resetWeights(pack.pack)
      weights = {}
      flash('Taste reset')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Reset failed')
    }
  }

  async function unban(id: string) {
    checkpoint()
    const next = new Set(banned)
    next.delete(id)
    banned = next
    await db.unbanChip(id)
  }

  async function clearBans() {
    checkpoint()
    await db.clearBanned()
    banned = new Set()
    flash('Bans cleared')
  }

  async function importPack(raw: string) {
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      packErr = 'Not valid JSON.'
      return
    }
    const v = validatePack(data)
    if (!v.ok) {
      packErr = v.error
      return
    }
    await db.savePack(data as Pack)
    packList = [starter, ...(await db.listPacks()).filter((p) => p.pack !== 'starter')]
    await usePack(data as Pack)
    packOpen = false
    packErr = ''
  }

  async function usePack(p: Pack) {
    pack = p
    db.setPrefs({ pack: p.pack })
    weights = await db.getWeights(p.pack)
    locked = {}
    generate(false)
  }

  function exportPack() {
    try {
      const clone = JSON.parse(JSON.stringify(pack)) as Pack
      clone.banned = [...banned]
      for (const chips of Object.values(clone.slots || {})) {
        for (const c of chips) {
          if (weights[c.id]) c.w = { ...weights[c.id] }
        }
      }
      const blob = new Blob([JSON.stringify(clone, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pack.pack}.json`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      flash(`Saved ${pack.pack}.json`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Export failed')
    }
  }

  function restore(entry: HistoryEntry) {
    checkpoint()
    seedInput = entry.seed.toString(16)
    const selected: Selection = {}
    for (const it of entry.items) {
      const chip = (pack.slots[it.slot] || []).find((c) => c.id === it.id) || {
        id: it.id,
        text: it.text,
        tags: [],
        w: { a: 2, b: 2 },
        x: 0,
      }
      selected[it.slot] = { slot: it.slot, chip, text: it.text }
    }
    current = { seed: entry.seed, selected }
    rated = null
    showHistory = false
  }

  function onDrift(e: Event) {
    drift = Number((e.target as HTMLInputElement).value)
    db.setPrefs({ drift })
  }

  function onHeat(e: Event) {
    heat = Number((e.target as HTMLInputElement).value)
    db.setPrefs({ heat })
  }

  function onDialect(d: Dialect) {
    dialect = d
    db.setPrefs({ dialect })
  }
</script>

{#if !ageOk}
  <AgeGate onConfirm={confirmAge} />
{:else}
  <div class="app">
    <header class="top">
      <div>
        <p class="kicker">Taste-Drift</p>
        <h1>A prompt that learns you</h1>
      </div>
      <div class="dialect" role="tablist">
        <button type="button" class:on={dialect === 'tag'} onclick={() => onDialect('tag')}>Tag</button>
        <button type="button" class:on={dialect === 'natural'} onclick={() => onDialect('natural')}>Natural</button>
      </div>
    </header>

    <section class="controls">
      <div class="sliders">
      <label class="drift">
        <span>Drift <em>{driftLabel}</em></span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={drift}
          oninput={onDrift}
          aria-valuetext={driftLabel}
        />
        <span class="ends"><span>familiar</span><span>surprise</span></span>
        <p class="caption">Left repeats chips you liked. Right rolls more at random.</p>
      </label>
      <label class="drift">
        <span>Heat <em>{heatLabel}</em></span>
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={heat}
          oninput={onHeat}
          aria-valuetext={heatLabel}
        />
        <span class="ends"><span>suggestive</span><span>explicit</span></span>
        <p class="caption">Caps how graphic the next roll can get. Locked chips stay.</p>
      </label>
      </div>
      <div class="seed-block">
        <label class="seed">
          <span>Seed</span>
          <input
            value={seedInput}
            spellcheck="false"
            autocomplete="off"
            title="Hex seed. Edit and press Enter to replay this roll."
            oninput={(e) => (seedInput = (e.target as HTMLInputElement).value)}
            onkeydown={(e) => e.key === 'Enter' && applySeed()}
            onblur={applySeed}
          />
        </label>
        <p class="caption">Random each Roll. Editable — Enter replays this exact prompt.</p>
      </div>
      <div class="actions">
        <button
          type="button"
          class="primary"
          title="New random seed. Clears all locks."
          onclick={() => generate(false)}
        >
          Roll
        </button>
        <button
          type="button"
          class="ghost"
          title="New seed, keep locked chips"
          onclick={rerollUnlocked}
        >
          Reroll unlocked
        </button>
        <button type="button" class="ghost" disabled={!canUndo} title="Undo (⌘Z)" onclick={undo}>Undo</button>
        <button type="button" class="ghost" disabled={!canRedo} title="Redo (⇧⌘Z)" onclick={redo}>Redo</button>
        <p class="caption">Roll starts over: new seed, locks cleared. Undo brings the last roll back.</p>
      </div>
    </section>

    {#if current}
      <section class="chips" aria-label="Prompt chips">
        {#each items as item (item.slot)}
          <Chip
            {item}
            locked={!!locked[item.slot]}
            open={menuSlot === item.slot}
            onToggle={(force) => toggleMenu(item.slot, force)}
            onLock={() => toggleLock(item.slot)}
            onSwap={() => {
              menuSlot = null
              swapSlot = item.slot
            }}
            onEdit={(t) => editChip(item.slot, t)}
            onBan={() => ban(item.slot)}
          />
        {/each}
      </section>

      <section class="out">
        <div class="prompt">
          <div class="row">
            <h2>{dialect === 'tag' ? 'Tags' : 'Prose'}</h2>
            <button type="button" class="ghost" onclick={() => copy('p')}>
              {copied === 'p' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p>{prompt}</p>
        </div>
        <div class="prompt neg">
          <div class="row">
            <h2>Negative</h2>
            <button type="button" class="ghost" onclick={() => copy('neg')}>
              {copied === 'neg' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p>{negative}</p>
        </div>
        <div class="rate">
          <button type="button" class="vote" class:on={rated === 'up'} onclick={() => rate(true)} disabled={!!rated}>
            Up
          </button>
          <button type="button" class="vote" class:on={rated === 'down'} onclick={() => rate(false)} disabled={!!rated}>
            Down
          </button>
          <p class="hint">
            {rated ? 'Saved to your taste.' : 'Rate the prompt. Weights stay on this device.'}
          </p>
        </div>
      </section>
    {/if}

    {#if hasTaste}
      <section class="taste-strip" aria-label="Taste clouds">
        <div class="row">
          <h2>Your taste</h2>
          <button type="button" class="ghost" onclick={() => (showTaste = true)}>Open</button>
        </div>
        <div class="clouds">
          <WordCloud title="Liked" tone="up" words={clouds.pos} />
          <WordCloud title="Disliked" tone="down" words={clouds.neg} />
        </div>
      </section>
    {/if}

    <footer>
      <p class="meta">{pack.pack} · {nChips} chips · {packList.length} pack{packList.length === 1 ? '' : 's'}</p>
      <div class="foot-actions">
        <button type="button" class="ghost" onclick={() => (showHistory = !showHistory)}>History</button>
        <button type="button" class="ghost" onclick={() => (showTaste = true)}>Taste</button>
        <button type="button" class="ghost" onclick={() => (packOpen = true)}>Import pack</button>
        <button type="button" class="ghost" onclick={exportPack}>Export pack</button>
        <button type="button" class="ghost" onclick={resetTaste}>Reset taste</button>
      </div>
      {#if packList.length > 1}
        <label class="pack-pick">
          Pack
          <select
            onchange={(e) => {
              const next = packList.find((p) => p.pack === (e.target as HTMLSelectElement).value)
              if (next) usePack(next)
            }}
            value={pack.pack}
          >
            {#each packList as p}
              <option value={p.pack}>{p.pack}</option>
            {/each}
          </select>
        </label>
      {/if}
    </footer>
  </div>
{/if}

{#if swapSlot && current}
  <SwapList
    chips={alternatives(pack, swapSlot, current.selected, banned, heat)}
    currentId={current.selected[swapSlot].chip.id}
    onPick={applySwap}
    onClose={() => (swapSlot = null)}
  />
{/if}

{#if packOpen}
  <PackModal error={packErr} onImport={importPack} onClose={() => (packOpen = false)} />
{/if}

{#if toast}
  <p class="toast" role="status">{toast}</p>
{/if}

{#if showTaste}
  <TastePanel
    {pack}
    {weights}
    {banned}
    onUnban={unban}
    onResetTaste={resetTaste}
    onClearBans={clearBans}
    onClose={() => (showTaste = false)}
  />
{/if}

{#if showHistory}
  <div class="overlay" onclick={() => (showHistory = false)} role="presentation">
    <div class="sheet" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (showHistory = false)}>
      <header class="row">
        <h2>History</h2>
        <button type="button" class="ghost" onclick={() => (showHistory = false)}>Close</button>
      </header>
      {#if !history.length}
        <p class="hint">No rolls yet.</p>
      {:else}
        <ul class="hist">
          {#each history as h}
            <li>
              <button type="button" onclick={() => restore(h)}>
                <span class="seed-mini">{h.seed.toString(16)}</span>
                <span class="clip">{h.prompt}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .app {
    max-width: 52rem;
    margin: 0 auto;
    padding: 2.25rem 1.25rem 4rem;
    display: grid;
    gap: 1.75rem;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1rem;
    flex-wrap: wrap;
  }
  h1 {
    font-family: var(--serif);
    font-weight: 450;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    letter-spacing: -0.03em;
    margin: 0.15rem 0 0;
    color: var(--ink);
    line-height: 1.1;
  }
  .controls {
    display: grid;
    gap: 1rem;
  }
  .sliders {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.5rem;
  }
  @media (max-width: 640px) {
    .sliders {
      grid-template-columns: 1fr;
    }
  }
  .drift,
  .seed {
    display: grid;
    gap: 0.3rem;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mute);
  }
  .drift em {
    font-style: normal;
    color: var(--ink);
    letter-spacing: 0;
    text-transform: none;
    margin-left: 0.4rem;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: none;
  }
  .caption {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0;
    text-transform: none;
    color: var(--mute);
    line-height: 1.35;
    max-width: 36rem;
  }
  .seed-block {
    display: grid;
    gap: 0.3rem;
  }
  .seed input {
    width: 10rem;
    font-family: var(--mono);
    text-transform: lowercase;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
  }
  .actions .caption {
    flex: 1 1 100%;
  }
  .taste-strip {
    display: grid;
    gap: 0.65rem;
  }
  .clouds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 640px) {
    .clouds {
      grid-template-columns: 1fr;
    }
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .dialect {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
  }
  .dialect button {
    border: none;
    background: transparent;
    padding: 0.4rem 0.9rem;
    color: var(--mute);
    cursor: pointer;
  }
  .dialect button.on {
    background: var(--ink);
    color: var(--bg);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .out {
    display: grid;
    gap: 1rem;
  }
  .prompt {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1rem 1.1rem;
  }
  .prompt.neg p {
    color: var(--mute);
    font-size: 0.9rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    font-weight: 550;
  }
  .prompt p {
    margin: 0.6rem 0 0;
    font-size: 1.02rem;
    line-height: 1.45;
    color: var(--ink);
  }
  .rate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .vote {
    min-width: 4.2rem;
    padding: 0.45rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .vote.on {
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .vote:disabled,
  button.ghost:disabled {
    opacity: 0.55;
    cursor: default;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
    padding-top: 0.5rem;
    border-top: 1px solid var(--line);
  }
  .meta {
    margin: 0;
    color: var(--mute);
    font-size: 0.85rem;
  }
  .foot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 10, 8, 0.45);
    display: grid;
    place-items: end center;
    z-index: 20;
    padding: 1rem;
  }
  .sheet {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 16px;
    width: min(40rem, 100%);
    max-height: 75dvh;
    overflow: auto;
    padding: 1.1rem;
  }
  .hist {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .hist button {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--wash);
    color: var(--ink);
    cursor: pointer;
  }
  .seed-mini {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--mute);
  }
  .clip {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.88rem;
  }
  .pack-pick {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.85rem;
    color: var(--mute);
  }
  .hint {
    margin: 0;
    color: var(--mute);
    font-size: 0.85rem;
  }
  .toast {
    position: fixed;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 0.45rem 0.9rem;
    background: var(--ink);
    color: var(--bg);
    border-radius: 999px;
    font-size: 0.85rem;
    z-index: 40;
    pointer-events: none;
  }
</style>
