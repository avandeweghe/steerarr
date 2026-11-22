<script lang="ts">
  /** Search box with a clear button. 17px text so iPhone Safari doesn't zoom in on focus. */
  let {
    value = $bindable(''),
    label,
    placeholder = 'Search',
  }: { value?: string; label: string; placeholder?: string } = $props();

  let input = $state<HTMLInputElement | null>(null);

  function clear(): void {
    value = '';
    input?.focus();
  }
</script>

<div class="search" role="search">
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
  <input
    bind:this={input}
    bind:value
    type="search"
    aria-label={label}
    {placeholder}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    enterkeyhint="search"
  />
  {#if value}
    <button type="button" class="clear" aria-label="Clear search" onclick={clear}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
    </button>
  {/if}
</div>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  input {
    width: 100%;
    min-height: var(--tap);
    padding: 0 var(--tap) 0 2.5rem;
    border: 1px solid var(--rigging-strong);
    border-radius: var(--radius-control);
    background: var(--hull);
    color: var(--sailcloth);
    font: inherit;
    font-size: var(--size-body);
    appearance: none;
  }

  input::placeholder {
    color: var(--fog);
    opacity: 0.8;
  }

  input:focus {
    border-color: var(--brass);
    outline: none;
  }

  /* Safari's own clear button would sit next to ours. */
  input::-webkit-search-cancel-button {
    appearance: none;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .icon {
    position: absolute;
    left: 0.75rem;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--fog);
    pointer-events: none;
  }

  .clear {
    position: absolute;
    right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--fog);
    cursor: pointer;
  }

  .clear svg {
    width: 1.125rem;
    height: 1.125rem;
  }
</style>
