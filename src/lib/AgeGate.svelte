<script>
  let { onConfirm } = $props()
</script>

<div class="gate">
  <div class="card">
    <p class="kicker">Taste-Drift</p>
    <h1>Adults only</h1>
    <p class="lede">
      This is a prompt generator for adult text-to-image work. Nothing leaves
      your browser. Confirm you are 18 or older to continue.
    </p>
    <button type="button" class="primary" onclick={onConfirm}>I am 18 or older</button>
  </div>
</div>

<style>
  .gate {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem;
  }
  .card {
    max-width: 28rem;
    display: grid;
    gap: 1rem;
  }
  h1 {
    font-family: var(--serif);
    font-weight: 450;
    font-size: 2.4rem;
    letter-spacing: -0.03em;
    margin: 0;
    color: var(--ink);
  }
  .lede {
    color: var(--mute);
    margin: 0;
    line-height: 1.5;
  }
</style>
