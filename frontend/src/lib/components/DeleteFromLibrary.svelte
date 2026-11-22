<script lang="ts">
  import { errorMessage } from '../api';
  import StatusLamp from './StatusLamp.svelte';

  /**
   * Removes a series or movie from Sonarr or Radarr, behind a confirmation with the service's
   * own two choices: also delete the files from disk (off by default), and keep import lists
   * from adding it again. `ondelete` throws if the service refuses.
   */
  interface Props {
    /** "series" or "movie". */
    kind: string;
    title: string;
    serviceName: string;
    ondelete: (deleteFiles: boolean, exclude: boolean) => Promise<void>;
  }

  let { kind, title, serviceName, ondelete }: Props = $props();

  let confirming = $state(false);
  let deleteFiles = $state(false);
  let exclude = $state(false);
  let deleting = $state(false);
  let error = $state<string | null>(null);

  function start(): void {
    confirming = true;
    deleteFiles = false;
    exclude = false;
    error = null;
  }

  async function confirm(): Promise<void> {
    deleting = true;
    error = null;
    try {
      await ondelete(deleteFiles, exclude);
    } catch (err) {
      error = `Couldn't delete the ${kind}. ${errorMessage(err)}`;
      deleting = false;
    }
  }
</script>

{#if !confirming}
  <button class="button danger" type="button" onclick={start}>Delete {kind}</button>
{:else}
  <div class="confirm" role="group" aria-label="Delete {kind}">
    <p>
      Remove <strong>{title}</strong> from {serviceName}? {serviceName} stops monitoring and downloading
      it.
    </p>
    <label class="check">
      <input type="checkbox" bind:checked={deleteFiles} />
      Also delete its files from disk
    </label>
    {#if deleteFiles}
      <p class="warning">The {kind}'s folder and everything in it will be deleted.</p>
    {/if}
    <label class="check">
      <input type="checkbox" bind:checked={exclude} />
      Don't let import lists add it again
    </label>
    {#if error}
      <p class="error" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>{error}</span>
      </p>
    {/if}
    <div class="actions">
      <button class="button danger" type="button" disabled={deleting} onclick={confirm}>
        {deleting ? 'Deleting…' : deleteFiles ? `Delete ${kind} and files` : `Delete ${kind}`}
      </button>
      <button class="button" type="button" disabled={deleting} onclick={() => (confirming = false)}>
        Cancel
      </button>
    </div>
  </div>
{/if}

<style>
  .confirm {
    display: grid;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--port);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  .warning {
    color: var(--port);
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
