<script lang="ts">
  import { mean } from '../engine/sampling'
  import { lookupChip, splitTaste } from './taste'
  import WordCloud from './WordCloud.svelte'
  import type { Pack, TasteWord, WeightMap } from '../types'

  let {
    pack,
    weights,
    banned,
    onUnban,
    onResetTaste,
    onClearBans,
    onClose,
  }: {
    pack: Pack
    weights: WeightMap
    banned: Set<string>
    onUnban: (id: string) => void
    onResetTaste: () => void
    onClearBans: () => void
    onClose: () => void
  } = $props()

  const prefs = $derived(
    Object.entries(weights)
      .map(([id, w]) => {
        const { slot, text } = lookupChip(pack, id)
        return { id, slot, text, w, score: mean(w), n: w.a + w.b - 4 }
      })
      .filter((p) => p.n !== 0 || p.w.a !== 2 || p.w.b !== 2)
      .sort((a, b) => b.score - a.score || b.n - a.n),
  )

  const bans = $derived([...banned].map((id) => ({ id, ...lookupChip(pack, id) })))
  const clouds = $derived(splitTaste(pack, weights, banned))

  function onWord(w: TasteWord) {
    if (w.banned) onUnban(w.id)
  }
</script>

<div class="overlay" onclick={onClose} role="presentation">
  <div
    class="sheet"
    role="dialog"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <header class="row">
      <h2>Taste</h2>
      <button type="button" class="ghost" onclick={onClose}>Close</button>
    </header>

    <div class="clouds">
      <WordCloud title="Liked" tone="up" words={clouds.pos} {onWord} />
      <WordCloud title="Disliked" tone="down" words={clouds.neg} {onWord} />
    </div>

    <section>
      <div class="row">
        <h3>Bans</h3>
        {#if bans.length}
          <button type="button" class="ghost" onclick={onClearBans}>Clear all</button>
        {/if}
      </div>
      {#if !bans.length}
        <p class="hint">No banned chips. Strike-through words in the cloud are bans — click to unban.</p>
      {:else}
        <ul>
          {#each bans as b (b.id)}
            <li>
              <div>
                <span class="slot">{b.slot}</span>
                <span>{b.text}</span>
              </div>
              <button type="button" class="ghost" onclick={() => onUnban(b.id)}>Unban</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <div class="row">
        <h3>Weights</h3>
        {#if prefs.length}
          <button type="button" class="ghost" onclick={onResetTaste}>Reset taste</button>
        {/if}
      </div>
      {#if !prefs.length}
        <p class="hint">No ratings yet. Up or down a roll to start.</p>
      {:else}
        <ul>
          {#each prefs as p (p.id)}
            <li>
              <div>
                <span class="slot">{p.slot}</span>
                <span>{p.text}</span>
                <span class="meta">{p.w.a - 2} up · {p.w.b - 2} down</span>
              </div>
              <span class="score" class:hot={p.score >= 0.6} class:cold={p.score <= 0.4}>
                {Math.round(p.score * 100)}%
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
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
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
    width: min(48rem, 100%);
    max-height: 85dvh;
    overflow: auto;
    padding: 1.1rem;
    display: grid;
    gap: 1.25rem;
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
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  h2,
  h3 {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    font-weight: 550;
  }
  h2 {
    font-family: var(--serif);
    font-size: 1.2rem;
    letter-spacing: -0.02em;
    text-transform: none;
    color: var(--ink);
    font-weight: 450;
  }
  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--wash);
  }
  li div {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .slot {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--mute);
  }
  .meta {
    font-size: 0.75rem;
    color: var(--mute);
  }
  .score {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--mute);
    flex-shrink: 0;
  }
  .score.hot {
    color: var(--accent);
  }
  .hint {
    margin: 0.4rem 0 0;
    color: var(--mute);
    font-size: 0.85rem;
  }
</style>
