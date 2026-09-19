<script>
  let { error, onImport, onClose } = $props()
  let text = $state('')
</script>

<div class="overlay" onclick={onClose} role="presentation">
  <div class="sheet" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <header>
      <h2>Import pack</h2>
      <button type="button" class="ghost" onclick={onClose}>Close</button>
    </header>
    <p>Paste JSON or choose a file. Packs are scanned for banned and age-ambiguous terms.</p>
    <input
      type="file"
      accept="application/json,.json"
      onchange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        text = await f.text()
      }}
    />
    <textarea bind:value={text} spellcheck="false" placeholder="paste pack JSON"></textarea>
    {#if error}<p class="err">{error}</p>{/if}
    <button
      type="button"
      class="primary"
      onclick={() => onImport(text)}
      disabled={!text.trim()}
    >
      Import
    </button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 10, 8, 0.45);
    display: grid;
    place-items: center;
    z-index: 20;
    padding: 1rem;
  }
  .sheet {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 16px;
    width: min(40rem, 100%);
    padding: 1.25rem;
    display: grid;
    gap: 0.75rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-family: var(--serif);
    font-weight: 450;
    margin: 0;
    font-size: 1.2rem;
  }
  p {
    margin: 0;
    color: var(--mute);
    font-size: 0.9rem;
  }
  textarea {
    min-height: 12rem;
    font-family: var(--mono);
    font-size: 0.8rem;
    padding: 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--wash);
    color: var(--ink);
    resize: vertical;
  }
  .err {
    color: var(--accent);
  }
</style>
