<script lang="ts">
  import type { NzbgetDeleteMode, NzbgetItemAction, NzbgetQueueItem } from '@steerarr/shared';
  import { errorMessage } from '../../../lib/api';
  import StatusLamp, { type LampTone } from '../../../lib/components/StatusLamp.svelte';
  import { formatBytes } from '../../../lib/format';
  import { changeItem, removeItem, setCategory } from '../api';

  /** One download in NZBGet's queue, with pause, resume, move, category and remove. */
  interface Props {
    item: NzbgetQueueItem;
    /** NZBGet's categories, or null while they're unknown (then the category can't change). */
    categories: string[] | null;
    /** Called after a change, so the page reloads the queue. */
    onchanged: () => void;
  }

  let { item, categories, onchanged }: Props = $props();

  /** The choices: NZBGet's categories, plus the download's own if it's not one of them. */
  const categoryChoices = $derived.by(() => {
    if (!categories) return [];
    const own = item.category;
    return own && !categories.includes(own) ? [...categories, own] : categories;
  });

  /** NZBGet's own choices when deleting, in its order. */
  const DELETE_MODES: Array<{ value: NzbgetDeleteMode; label: string }> = [
    { value: 'keepFiles', label: 'Move to history, keep the files downloaded so far' },
    { value: 'deleteFiles', label: 'Move to history, delete the files downloaded so far' },
    { value: 'noHistory', label: 'Delete without keeping it in history, and delete its files' },
  ];

  let busy = $state(false);
  let confirming = $state(false);
  /** Starts on deleting without history, as asked for. */
  let deleteMode = $state<NzbgetDeleteMode>('noHistory');
  let error = $state<string | null>(null);

  const progress = $derived.by(() => {
    if (item.state === 'processing' && item.stageProgress !== null) return item.stageProgress;
    return item.size > 0 ? 1 - item.remaining / item.size : 0;
  });

  const stateText = $derived.by(() => {
    if (item.state === 'downloading') return 'Downloading';
    if (item.state === 'queued') return 'Queued';
    if (item.state === 'paused') return 'Paused';
    if (item.state === 'processing') return item.stage ?? 'Post-processing';
    return item.status.toLowerCase().replace(/_/g, ' ');
  });

  const lamp = $derived.by((): LampTone => {
    if (item.health < 0.95) return 'warn';
    if (item.state === 'downloading' || item.state === 'processing') return 'ok';
    return 'pending';
  });

  const sizeText = $derived.by(() => {
    const done = formatBytes(Math.max(item.size - item.remaining, 0));
    return `${done} of ${formatBytes(item.size)}`;
  });

  async function run(change: () => Promise<void>): Promise<void> {
    busy = true;
    error = null;
    try {
      await change();
      confirming = false;
      onchanged();
    } catch (err) {
      error = errorMessage(err);
    } finally {
      busy = false;
    }
  }

  function act(action: NzbgetItemAction): Promise<void> {
    return run(() => changeItem(item.id, action));
  }

  const pause = () => act('pause');
  const resume = () => act('resume');
  const toTop = () => act('top');
  const toBottom = () => act('bottom');

  function startRemove(): void {
    confirming = true;
  }

  function cancelRemove(): void {
    confirming = false;
  }

  function remove(): Promise<void> {
    return run(() => removeItem(item.id, deleteMode));
  }

  function chooseCategory(event: Event): Promise<void> {
    const category = (event.currentTarget as HTMLSelectElement).value;
    return run(() => setCategory(item.id, category));
  }
</script>

<li class="item">
  <div class="head">
    <StatusLamp tone={lamp} label={stateText} />
    <p class="name">{item.name}</p>
  </div>
  <span class="bar" aria-hidden="true"><span style:width="{progress * 100}%"></span></span>
  <p class="meta">
    <span>{stateText}</span>
    <span>{sizeText}</span>
    {#if item.category && !categories}<span>{item.category}</span>{/if}
    {#if item.health < 1}<span>Health {Math.floor(item.health * 1000) / 10}%</span>{/if}
  </p>

  {#if categories}
    <label class="category">
      <span>Category</span>
      <select value={item.category ?? ''} disabled={busy} onchange={chooseCategory}>
        <option value="">None</option>
        {#each categoryChoices as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if confirming}
    <fieldset class="confirm">
      <legend>How should NZBGet delete this download?</legend>
      {#each DELETE_MODES as option (option.value)}
        <label class="check">
          <input type="radio" name="mode-{item.id}" value={option.value} bind:group={deleteMode} />
          {option.label}
        </label>
      {/each}
      <div class="actions">
        <button class="button danger" type="button" disabled={busy} onclick={remove}>Delete</button>
        <button class="button" type="button" onclick={cancelRemove}>Cancel</button>
      </div>
    </fieldset>
  {:else}
    <div class="actions">
      {#if item.state === 'paused'}
        <button class="button" type="button" disabled={busy} onclick={resume}>Resume</button>
      {:else if item.state === 'queued' || item.state === 'downloading'}
        <button class="button" type="button" disabled={busy} onclick={pause}>Pause</button>
      {/if}
      {#if item.state !== 'processing'}
        <button class="button" type="button" disabled={busy} onclick={toTop}>To top</button>
        <button class="button" type="button" disabled={busy} onclick={toBottom}>To bottom</button>
      {/if}
      <button class="button" type="button" disabled={busy} onclick={startRemove}>Delete…</button>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>{error}</span>
    </p>
  {/if}
</li>

<style>
  .item {
    display: grid;
    gap: 0.5rem;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .name {
    min-width: 0;
    font-size: var(--size-secondary);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .bar {
    display: block;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--rigging);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--starboard);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .category {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--fog);
    font-size: var(--size-caption);
  }

  .category select {
    min-height: var(--tap);
    padding: 0 0.75rem;
    border: 1px solid var(--rigging-strong);
    border-radius: var(--radius-control);
    background: var(--sea);
    color: var(--sailcloth);
    font: inherit;
    font-size: var(--size-body);
  }

  .confirm {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    margin: 0;
    padding: 0.875rem;
    border: 1px solid var(--port);
    border-radius: var(--radius-panel);
    font-size: var(--size-secondary);
  }

  legend {
    float: left;
    width: 100%;
    margin-bottom: 0.25rem;
    padding: 0;
    font-weight: 600;
  }

  .confirm .actions {
    margin-top: 0.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
