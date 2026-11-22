<script lang="ts">
  import type { AddDefaultsRequest } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { api, errorMessage } from '../api';
  import StatusLamp from './StatusLamp.svelte';

  /**
   * The quality profile a service's add form starts with (Sonarr, Radarr). Saved in Steerarr,
   * so it's the same on every device. "None" leaves the form on the one used last on the device.
   */
  interface Props {
    serviceId: string;
    serviceName: string;
    /** "series" or "movie", for the explanation. */
    noun: string;
  }

  let { serviceId, serviceName, noun }: Props = $props();

  interface Options {
    qualityProfiles: Array<{ id: number; name: string }>;
    defaultQualityProfileId: number | null;
  }

  let options = $state<Options | null>(null);
  /** 0 for none. */
  let selected = $state(0);
  let loadError = $state<string | null>(null);
  let saving = $state(false);
  let outcome = $state<{ ok: boolean; message: string } | null>(null);

  onMount(load);

  async function load(): Promise<void> {
    loadError = null;
    try {
      options = await api<Options>(`${serviceId}/add-options`);
      selected = options.defaultQualityProfileId ?? 0;
    } catch (err) {
      loadError = errorMessage(err);
    }
  }

  async function save(): Promise<void> {
    const body: AddDefaultsRequest = { qualityProfileId: selected || null };
    saving = true;
    outcome = null;
    try {
      await api<void>(`${serviceId}/add-defaults`, { method: 'PUT', body });
      outcome = { ok: true, message: 'Saved.' };
    } catch (err) {
      outcome = { ok: false, message: `Couldn't save it. ${errorMessage(err)}` };
    } finally {
      saving = false;
    }
  }
</script>

<section class="panel defaults">
  <h2>Adding a {noun}</h2>
  {#if loadError}
    <p class="line" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't load {serviceName}'s quality profiles. {loadError}</span>
    </p>
    <button class="button" type="button" onclick={load}>Try again</button>
  {:else if !options}
    <p class="muted">Loading {serviceName}'s quality profiles…</p>
  {:else}
    <div class="field">
      <label for="{serviceId}-default-profile">Default quality profile</label>
      <select
        id="{serviceId}-default-profile"
        bind:value={selected}
        onchange={save}
        disabled={saving}
      >
        <option value={0}>None (last used on this device)</option>
        {#each options.qualityProfiles as profile (profile.id)}
          <option value={profile.id}>{profile.name}</option>
        {/each}
      </select>
      <p class="hint">
        Selected first when you add a {noun}, on every device. You can still change it there.
      </p>
    </div>
    {#if outcome}
      <p class="line" aria-live="polite">
        <StatusLamp tone={outcome.ok ? 'ok' : 'error'} label={outcome.ok ? 'Saved' : 'Failed'} />
        <span>{outcome.message}</span>
      </p>
    {/if}
  {/if}
</section>

<style>
  .defaults {
    display: grid;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  h2 {
    font-size: var(--size-heading);
  }

  .line {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
