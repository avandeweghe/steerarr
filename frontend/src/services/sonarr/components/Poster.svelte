<script lang="ts">
  /**
   * Series poster, with the title's first letter as a stand-in when there's no image.
   * A failed image is tried again whenever `retryOn` changes (e.g. after the list refreshes).
   */
  interface Props {
    src: string | null;
    title: string;
    retryOn?: unknown;
    /** Twice the list size, for a series page. */
    large?: boolean;
  }

  let { src, title, retryOn, large = false }: Props = $props();

  // Back to false whenever src or retryOn changes; set to true when the image fails to load.
  let failed = $derived.by(() => {
    void src;
    void retryOn;
    return false;
  });
  const initial = $derived(
    title
      .replace(/^(the|a|an)\s+/i, '')
      .charAt(0)
      .toUpperCase(),
  );
</script>

<div class="poster" class:large>
  {#if src && !failed}
    <img
      {src}
      alt=""
      width="170"
      height="250"
      loading="lazy"
      decoding="async"
      onerror={() => (failed = true)}
    />
  {:else}
    <span aria-hidden="true">{initial}</span>
  {/if}
</div>

<style>
  .poster {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.25rem;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 6px;
    background: var(--rigging);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  span {
    color: var(--fog);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 600;
  }

  .large {
    width: 6.5rem;
    border-radius: 8px;
  }

  .large span {
    font-size: 3rem;
  }
</style>
