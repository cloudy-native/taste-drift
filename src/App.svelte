<script>
  import { onMount } from 'svelte'
  import AgeGate from './lib/AgeGate.svelte'
  import Chip from './lib/Chip.svelte'
  import SwapList from './lib/SwapList.svelte'
  import PackModal from './lib/PackModal.svelte'
  import { starter, chipCount } from './packs/starter.js'
  import { roll, alternatives, slotsOf, expand } from './engine/grammar.js'
  import { exportPrompt } from './engine/dialects.js'
  import { applyFeedback, prior } from './engine/sampling.js'
  import { mulberry32, randomSeed } from './engine/prng.js'
  import { validatePack } from './engine/validate.js'
  import * as db from './storage/db.js'

  let ageOk = $state(false)
  let pack = $state(starter)
  let packList = $state([])
  let weights = $state({})
  let banned = $state(new Set())
  let locked = $state({})
  let drift = $state(0.25)
  let dialect = $state('tag')
  let seedInput = $state('')
  let current = $state(null)
  let history = $state([])
  let rated = $state(null)
  let swapSlot = $state(null)
  let packOpen = $state(false)
  let packErr = $state('')
  let copied = $state('')
  let showHistory = $state(false)

  const nChips = $derived(chipCount(pack))
  const prompt = $derived(
    current ? exportPrompt(dialect, current.selected, pack, weights) : '',
  )
  const negative = $derived(
    current ? exportPrompt('negative', current.selected, pack, weights) : '',
  )
  const order = $derived(slotsOf(pack))
  const items = $derived(order.map((s) => current?.selected[s]).filter(Boolean))

  onMount(async () => {
    const prefs = db.getPrefs()
    ageOk = !!prefs.ageOk
    drift = prefs.drift ?? 0.25
    dialect = prefs.dialect ?? 'tag'
    banned = await db.getBanned()
    history = await db.listHistory()
    const stored = await db.listPacks()
    packList = [starter, ...stored.filter((p) => p.pack !== 'starter')]
    if (prefs.pack && packList.some((p) => p.pack === prefs.pack)) {
      pack = packList.find((p) => p.pack === prefs.pack)
    }
    weights = await db.getWeights(pack.pack)
    if (ageOk) generate(false)
  })

  function confirmAge() {
    ageOk = true
    db.setPrefs({ ageOk: true })
    generate(false)
  }

  function generate(keepLocks, seed) {
    const s = seed ?? randomSeed()
    seedInput = s.toString(16)
    current = roll(pack, {
      seed: s,
      locked: keepLocks ? locked : {},
      banned,
      weights,
      drift,
    })
    if (!keepLocks) locked = {}
    rated = null
    persistHistory(current)
  }

  function rerollUnlocked() {
    generate(true)
  }

  async function persistHistory(snapshot) {
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

  function toggleLock(slot) {
    if (locked[slot]) {
      const next = { ...locked }
      delete next[slot]
      locked = next
    } else {
      locked = { ...locked, [slot]: current.selected[slot] }
    }
  }

  function applySwap(chip) {
    const slot = swapSlot
    const rng = mulberry32((current.seed ^ slot.length * 997) >>> 0)
    const item = { slot, chip, text: expand(chip.text, pack.fragments, rng) }
    current = { ...current, selected: { ...current.selected, [slot]: item } }
    if (locked[slot]) locked = { ...locked, [slot]: item }
    swapSlot = null
  }

  function editChip(slot, text) {
    const item = { ...current.selected[slot], text }
    current = { ...current, selected: { ...current.selected, [slot]: item } }
    if (locked[slot]) locked = { ...locked, [slot]: item }
  }

  async function ban(slot) {
    const id = current.selected[slot].chip.id
    await db.banChip(id)
    banned = new Set([...banned, id])
    const next = { ...locked }
    delete next[slot]
    locked = next
    generate(true)
  }

  async function rate(liked) {
    if (!current || rated) return
    rated = liked ? 'up' : 'down'
    const next = { ...weights }
    for (const item of Object.values(current.selected)) {
      const w = next[item.chip.id] || item.chip.w || prior()
      next[item.chip.id] = applyFeedback(w, liked)
      await db.setWeight(pack.pack, item.chip.id, next[item.chip.id])
    }
    weights = next
  }

  async function copy(which) {
    const text = which === 'neg' ? negative : prompt
    await navigator.clipboard.writeText(text)
    copied = which
    setTimeout(() => (copied = ''), 1200)
  }

  function applySeed() {
    const n = parseInt(seedInput.trim(), 16)
    if (Number.isFinite(n)) generate(true, n >>> 0)
  }

  async function resetTaste() {
    await db.resetWeights(pack.pack)
    weights = {}
  }

  async function importPack(raw) {
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
    await db.savePack(data)
    packList = [starter, ...(await db.listPacks()).filter((p) => p.pack !== 'starter')]
    await usePack(data)
    packOpen = false
    packErr = ''
  }

  async function usePack(p) {
    pack = p
    db.setPrefs({ pack: p.pack })
    weights = await db.getWeights(p.pack)
    locked = {}
    generate(false)
  }

  function exportPack() {
    const clone = structuredClone(pack)
    for (const chips of Object.values(clone.slots)) {
      for (const c of chips) {
        if (weights[c.id]) c.w = weights[c.id]
      }
    }
    const blob = new Blob([JSON.stringify(clone, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${pack.pack}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function restore(entry) {
    seedInput = entry.seed.toString(16)
    const selected = {}
    for (const it of entry.items) {
      const chip = (pack.slots[it.slot] || []).find((c) => c.id === it.id) || {
        id: it.id,
        text: it.text,
        tags: [],
      }
      selected[it.slot] = { slot: it.slot, chip, text: it.text }
    }
    current = { seed: entry.seed, selected }
    rated = null
    showHistory = false
  }

  function onDrift(e) {
    drift = Number(e.target.value)
    db.setPrefs({ drift })
  }

  function onDialect(d) {
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
      <label class="drift">
        <span>Drift <em>{drift < 0.35 ? 'exploit' : drift > 0.65 ? 'explore' : 'mix'}</em></span>
        <input type="range" min="0" max="1" step="0.05" value={drift} oninput={onDrift} />
      </label>
      <label class="seed">
        <span>Seed</span>
        <input
          value={seedInput}
          oninput={(e) => (seedInput = e.target.value)}
          onkeydown={(e) => e.key === 'Enter' && applySeed()}
        />
      </label>
      <button type="button" class="primary" onclick={() => generate(false)}>Roll</button>
      <button type="button" class="ghost" onclick={rerollUnlocked}>Reroll unlocked</button>
    </section>

    {#if current}
      <section class="chips" aria-label="Prompt chips">
        {#each items as item (item.slot)}
          <Chip
            {item}
            locked={!!locked[item.slot]}
            onLock={() => toggleLock(item.slot)}
            onSwap={() => (swapSlot = item.slot)}
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
          <button type="button" class="vote" class:on={rated === 'up'} onclick={() => rate(true)} disabled={rated}>
            Up
          </button>
          <button type="button" class="vote" class:on={rated === 'down'} onclick={() => rate(false)} disabled={rated}>
            Down
          </button>
          <p class="hint">
            {rated ? 'Saved to your taste.' : 'Rate the prompt. Weights stay on this device.'}
          </p>
        </div>
      </section>
    {/if}

    <footer>
      <p class="meta">{pack.pack} · {nChips} chips · {packList.length} pack{packList.length === 1 ? '' : 's'}</p>
      <div class="foot-actions">
        <button type="button" class="ghost" onclick={() => (showHistory = !showHistory)}>History</button>
        <button type="button" class="ghost" onclick={() => (packOpen = true)}>Import pack</button>
        <button type="button" class="ghost" onclick={exportPack}>Export pack</button>
        <button type="button" class="ghost" onclick={resetTaste}>Reset taste</button>
      </div>
      {#if packList.length > 1}
        <label class="pack-pick">
          Pack
          <select onchange={(e) => usePack(packList.find((p) => p.pack === e.target.value))} value={pack.pack}>
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
    chips={alternatives(pack, swapSlot, current.selected, banned)}
    currentId={current.selected[swapSlot].chip.id}
    onPick={applySwap}
    onClose={() => (swapSlot = null)}
  />
{/if}

{#if packOpen}
  <PackModal error={packErr} onImport={importPack} onClose={() => (packOpen = false)} />
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
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: end;
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
  .drift {
    flex: 1 1 12rem;
  }
  .drift em {
    font-style: normal;
    color: var(--ink);
    letter-spacing: 0;
    text-transform: none;
    margin-left: 0.4rem;
  }
  .seed input {
    width: 8rem;
    font-family: var(--mono);
    text-transform: lowercase;
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
  .vote:disabled {
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
</style>
