<script lang="ts">
  /**
   * Bookmark button that turns monitoring on or off, like Sonarr's own: filled brass when
   * monitored, an outline when not. `onchange` saves the new value; errors are the caller's.
   */
  interface Props {
    monitored: boolean;
    /** What it monitors, e.g. "this movie", for screen readers. */
    label: string;
    onchange: (monitored: boolean) => Promise<void>;
  }

  let { monitored, label, onchange }: Props = $props();

  let busy = $state(false);

  async function toggle(): Promise<void> {
    busy = true;
    try {
      await onchange(!monitored);
    } finally {
      busy = false;
    }
  }
</script>

<button
  type="button"
  class:monitored
  aria-pressed={monitored}
  aria-label="Monitor {label}"
  title={monitored ? 'Monitored' : 'Not monitored'}
  disabled={busy}
  onclick={toggle}
>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v17l-5-4-5 4z" /></svg>
</button>

<style>
  button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--fog);
    cursor: pointer;
    touch-action: manipulation;
  }

  button:active {
    background: var(--rigging);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linejoin: round;
  }

  .monitored {
    color: var(--brass);
  }

  .monitored svg {
    fill: currentColor;
  }
</style>
