<script lang="ts">
  import { version } from '../version.svelte';
  import StatusLamp from './StatusLamp.svelte';

  /** Floats above the tab bar once the server runs a newer Steerarr than this page. */
  function reload(): void {
    location.reload();
  }
</script>

{#if version.updateAvailable}
  <div class="update" role="status">
    <StatusLamp tone="warn" label="Update available" />
    <p>Steerarr has been updated. Reload to use the new version.</p>
    <button class="button primary" type="button" onclick={reload}>Reload</button>
  </div>
{/if}

<style>
  .update {
    position: fixed;
    right: calc(var(--gutter) + var(--safe-right));
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 0.75rem);
    left: calc(var(--gutter) + var(--safe-left));
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: calc(var(--content-width) - 2 * var(--gutter));
    margin: 0 auto;
    padding: 0.625rem 0.75rem 0.625rem 1rem;
    border: 1px solid var(--rigging-strong);
    border-radius: var(--radius-panel);
    background: var(--hull);
  }

  p {
    flex: 1;
    font-size: var(--size-secondary);
  }
</style>
