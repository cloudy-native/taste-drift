<script>
  let { item, locked, onLock, onSwap, onEdit, onBan } = $props()
  let open = $state(false)
  let editing = $state(false)
  let draft = $state('')

  function startEdit() {
    draft = item.text
    editing = true
    open = false
  }

  function commitEdit() {
    const t = draft.trim()
    if (t) onEdit(t)
    editing = false
  }
</script>

<div class="wrap">
  <button
    type="button"
    class="chip"
    class:locked
    onclick={() => (open = !open)}
  >
    <span class="slot">{item.slot}</span>
    {#if editing}
      <input
        bind:value={draft}
        onkeydown={(e) => e.key === 'Enter' && commitEdit()}
        onblur={commitEdit}
      />
    {:else}
      <span class="text">{item.text}</span>
    {/if}
    {#if locked}<span class="lock" aria-hidden="true">▾</span>{/if}
  </button>
  {#if open}
    <div class="menu">
      <button type="button" onclick={() => { onLock(); open = false }}>
        {locked ? 'Unlock' : 'Lock'}
      </button>
      <button type="button" onclick={() => { onSwap(); open = false }}>Swap</button>
      <button type="button" onclick={startEdit}>Edit</button>
      <button type="button" class="danger" onclick={() => { onBan(); open = false }}>Ban</button>
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
  }
  .chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    text-align: left;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink);
    border-radius: 999px;
    cursor: pointer;
    max-width: 100%;
  }
  .chip:hover,
  .chip.locked {
    border-color: var(--accent);
  }
  .chip.locked {
    background: var(--accent-dim);
  }
  .slot {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--mute);
  }
  .text {
    font-size: 0.92rem;
    line-height: 1.3;
  }
  input {
    font: inherit;
    color: inherit;
    background: transparent;
    border: none;
    outline: none;
    min-width: 12ch;
  }
  .menu {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    gap: 0.25rem;
    padding: 0.3rem;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow);
  }
  .menu button {
    font-size: 0.75rem;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ink);
    cursor: pointer;
    border-radius: 4px;
  }
  .menu button:hover {
    background: var(--wash);
  }
  .danger {
    color: var(--accent) !important;
  }
  .lock {
    display: none;
  }
</style>
