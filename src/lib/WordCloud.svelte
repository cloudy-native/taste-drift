<script lang="ts">
  import { cloudify } from './taste'
  import type { TasteWord } from '../types'

  let {
    title,
    tone = 'up',
    words = [],
    onWord,
  }: {
    title: string
    tone?: 'up' | 'down'
    words?: TasteWord[]
    onWord?: (w: TasteWord) => void
  } = $props()
  const placed = $derived(cloudify(words))
</script>

<div class="cloud" class:up={tone === 'up'} class:down={tone === 'down'}>
  <h3>{title}</h3>
  {#if !placed.length}
    <p class="empty">Nothing here yet.</p>
  {:else}
    <div class="words">
      {#each placed as w (w.id)}
        <button
          type="button"
          class="word"
          class:banned={w.banned}
          class:click={!!onWord}
          style="--size: {w.size}rem; --rot: {w.rot}deg; --delay: {w.delay}s"
          title="{w.slot}{w.banned ? ' · banned' : ''} · {w.ups} up · {w.downs} down"
          onclick={() => onWord?.(w)}
        >
          {w.text}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cloud {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0.9rem 1rem 1.1rem;
    min-height: 8rem;
  }
  h3 {
    margin: 0 0 0.55rem;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    font-weight: 550;
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.15rem 0.55rem;
    min-height: 5.5rem;
  }
  .word {
    border: none;
    background: none;
    font-family: var(--serif);
    font-size: var(--size);
    line-height: 1.15;
    color: inherit;
    padding: 0.05rem 0.1rem;
    transform: rotate(var(--rot));
    animation: drift 7s ease-in-out infinite;
    animation-delay: var(--delay);
    max-width: 100%;
    cursor: default;
  }
  .word.click {
    cursor: pointer;
  }
  .word.click:hover {
    color: var(--ink);
  }
  .up .word {
    color: var(--accent);
  }
  .down .word {
    color: var(--cool);
  }
  .word.banned {
    text-decoration: line-through;
    opacity: 0.7;
  }
  .empty {
    margin: 0;
    color: var(--mute);
    font-size: 0.85rem;
  }

  @keyframes drift {
    0%,
    100% {
      transform: translateY(0) rotate(var(--rot));
    }
    50% {
      transform: translateY(-4px) rotate(var(--rot));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .word {
      animation: none;
    }
  }
</style>
