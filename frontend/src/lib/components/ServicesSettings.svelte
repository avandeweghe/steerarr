<script lang="ts">
  import { services } from '../services.svelte';
  import StatusLamp from './StatusLamp.svelte';

  /**
   * The Services section of Settings: every kind of service Steerarr supports. Add or edit one
   * on its own settings page, which also removes it.
   */
</script>

<section>
  <h2>Services</h2>
  <p class="muted intro">Each service Steerarr can control. Set one up to get its tab.</p>
  <ul>
    {#each services.items ?? [] as { def, configured, url } (def.id)}
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={def.icon} /></svg>
        <div class="text">
          <p class="name">{def.name}</p>
          <p class="detail">
            {#if configured}
              <StatusLamp tone="ok" label="Set up" />
              <span>{url}</span>
            {:else}
              <span>Not set up</span>
            {/if}
          </p>
        </div>
        <a class="button" href="#/{def.id}/settings">{configured ? 'Edit' : 'Add'}</a>
      </li>
    {/each}
  </ul>
</section>

<style>
  h2 {
    font-size: var(--size-heading);
  }

  .intro {
    margin: 0.375rem 0 0.5rem;
    font-size: var(--size-secondary);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--rigging);
  }

  svg {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: var(--fog);
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .name {
    font-weight: 600;
  }

  .detail {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    overflow: hidden;
    color: var(--fog);
    font-size: var(--size-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .button {
    text-decoration: none;
  }
</style>
