<script lang="ts">
  import type { Chip } from '../types'

  let {
    chips,
    currentId,
    onPick,
    onClose,
  }: {
    chips: Chip[]
    currentId: string
    onPick: (chip: Chip) => void
    onClose: () => void
  } = $props()
</script>

<div class="overlay" onclick={onClose} role="presentation">
  <div class="sheet" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <header>
      <h2>Swap chip</h2>
      <button type="button" class="ghost" onclick={onClose}>Close</button>
    </header>
    <ul>
      {#each chips as c}
        <li>
          <button
            type="button"
            class:on={c.id === currentId}
            onclick={() => onPick(c)}
          >
            {c.text}
          </button>
        </li>
      {/each}
    </ul>
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
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 16px 16px 8px 8px;
    width: min(36rem, 100%);
    max-height: 70dvh;
    overflow: auto;
    padding: 1rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  h2 {
    font-family: var(--serif);
    font-weight: 450;
    margin: 0;
    font-size: 1.2rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  li button {
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.7rem;
    border: 1px solid transparent;
    background: var(--wash);
    border-radius: 8px;
    color: var(--ink);
    cursor: pointer;
  }
  li button.on,
  li button:hover {
    border-color: var(--accent);
  }
</style>
