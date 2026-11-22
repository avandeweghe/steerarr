<script lang="ts">
  import type { Snippet } from 'svelte';
  import BackLink from './BackLink.svelte';

  interface Props {
    title: string;
    /** A link back to the page this one belongs to, shown above the title. */
    back?: { href: string; label: string };
    actions?: Snippet;
  }

  let { title, back, actions }: Props = $props();
</script>

<header class:with-back={back !== undefined}>
  {#if back}
    <BackLink href={back.href} label={back.label} />
  {/if}
  <div class="row">
    <h1>{title}</h1>
    {#if actions}
      <div class="actions">{@render actions()}</div>
    {/if}
  </div>
</header>

<style>
  header {
    padding: calc(var(--safe-top) + 1.25rem) 0 1rem;
  }

  .with-back {
    padding-top: calc(var(--safe-top) + 0.25rem);
  }

  .row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--gutter);
  }

  h1 {
    min-width: 0;
    font-size: var(--size-title);
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
