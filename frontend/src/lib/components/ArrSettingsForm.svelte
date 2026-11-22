<script lang="ts">
  import { onMount } from 'svelte';
  import type { ArrSettings, ArrSettingsTestRequest } from '@steerarr/shared';
  import { ApiError, errorMessage } from '../api';
  import { arrSettings } from '../arr-settings';
  import StatusLamp, { type LampTone } from './StatusLamp.svelte';

  /**
   * Settings form for a service: its address and API key (or username and password), with test,
   * save (or "Save anyway" after a failed test) and remove. The saved key or password never comes
   * back from the server; we only know one is saved.
   */
  let {
    serviceId,
    serviceName,
    credentials = 'apiKey',
    credentialsHint,
    onsaved,
    onremoved,
  }: {
    serviceId: string;
    serviceName: string;
    credentials?: 'apiKey' | 'login';
    /** Where to find the key, or the username and password, in the service. */
    credentialsHint: string;
    onsaved: () => void;
    onremoved: () => void;
  } = $props();

  const login = $derived(credentials === 'login');
  const secretLabel = $derived(login ? 'Password' : 'API key');

  interface Outcome {
    tone: LampTone;
    label: string;
    text: string;
  }

  let saved = $state<ArrSettings | null>(null);
  let loadError = $state<string | null>(null);
  let url = $state('');
  let username = $state('');
  let apiKey = $state('');
  let busy = $state(false);
  let outcome = $state<Outcome | null>(null);
  let offerSaveAnyway = $state(false);
  let confirmingRemove = $state(false);

  /** The saved key can be reused only while the address is the saved one. */
  const keyReusable = $derived(
    saved?.apiKeySaved === true && saved.url !== null && sameAddress(url, saved.url),
  );

  /**
   * The server's own check: the scheme and host ignore case, but the path doesn't, so
   * "/Sonarr" and "/sonarr" are different addresses and need the key again.
   */
  function sameAddress(a: string, b: string): boolean {
    const normalized = normalizeAddress(a);
    return normalized !== null && normalized === normalizeAddress(b);
  }

  function normalizeAddress(raw: string): string | null {
    try {
      const address = new URL(raw.trim());
      address.search = '';
      address.hash = '';
      return address.toString().replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  async function loadSettings(): Promise<void> {
    loadError = null;
    try {
      saved = await arrSettings.get(serviceId);
      url = saved.url ?? '';
      username = saved.username ?? '';
    } catch (err) {
      loadError = errorMessage(err);
    }
  }

  onMount(loadSettings);

  /** Any edit makes earlier results stale. */
  function edited(): void {
    outcome = null;
    offerSaveAnyway = false;
  }

  function request(): ArrSettingsTestRequest {
    // Keys never have spaces at the ends; a password might.
    const secret = login ? apiKey : apiKey.trim();
    const body: ArrSettingsTestRequest = secret ? { url, apiKey: secret } : { url };
    if (login) body.username = username.trim();
    return body;
  }

  function failed(err: unknown): Outcome {
    return { tone: 'error', label: 'Failed', text: errorMessage(err) };
  }

  /** Upstream failures can be saved anyway; our own validation errors can't. */
  function canSaveAnyway(err: unknown): boolean {
    return err instanceof ApiError && err.code.startsWith('upstream_');
  }

  async function test(): Promise<void> {
    busy = true;
    offerSaveAnyway = false;
    outcome = {
      tone: 'pending',
      label: 'Testing',
      text: `Testing the connection to ${serviceName}…`,
    };
    try {
      const status = await arrSettings.test(serviceId, request());
      outcome = {
        tone: 'ok',
        label: 'Connected',
        text: `Connected to ${status.instanceName} version ${status.version}`,
      };
    } catch (err) {
      outcome = failed(err);
    } finally {
      busy = false;
    }
  }

  async function save(force = false): Promise<void> {
    busy = true;
    confirmingRemove = false;
    outcome = {
      tone: 'pending',
      label: 'Saving',
      text: force ? 'Saving…' : `Testing the connection to ${serviceName} and saving…`,
    };
    try {
      saved = await arrSettings.save(serviceId, { ...request(), force });
      url = saved.url ?? url;
      apiKey = '';
      offerSaveAnyway = false;
      outcome = { tone: 'ok', label: 'Saved', text: 'Saved' };
      onsaved();
    } catch (err) {
      outcome = failed(err);
      offerSaveAnyway = !force && canSaveAnyway(err);
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    busy = true;
    try {
      await arrSettings.remove(serviceId);
      saved = { url: null, apiKeySaved: false, username: null };
      url = '';
      apiKey = '';
      confirmingRemove = false;
      outcome = { tone: 'ok', label: 'Removed', text: `Removed ${serviceName}'s settings` };
      onremoved();
    } catch (err) {
      outcome = failed(err);
    } finally {
      busy = false;
    }
  }
</script>

{#if loadError}
  <div class="panel load-error">
    <StatusLamp tone="error" label="Failed" />
    <div class="stack">
      <p>{loadError}</p>
      <button class="button" type="button" onclick={loadSettings}>Try again</button>
    </div>
  </div>
{:else if saved === null}
  <p class="muted">Loading settings…</p>
{:else}
  <form
    class="panel stack"
    novalidate
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <div class="field">
      <label for="{serviceId}-url">Address</label>
      <input
        id="{serviceId}-url"
        type="url"
        inputmode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="next"
        placeholder="https://{serviceId}.example.com"
        aria-describedby="{serviceId}-url-hint"
        bind:value={url}
        oninput={edited}
        disabled={busy}
      />
      <p class="hint" id="{serviceId}-url-hint">
        The address you open {serviceName} at, including any URL base.
      </p>
    </div>

    {#if login}
      <div class="field">
        <label for="{serviceId}-username">Username</label>
        <input
          id="{serviceId}-username"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="next"
          bind:value={username}
          oninput={edited}
          disabled={busy}
        />
      </div>
    {/if}

    <div class="field">
      <label for="{serviceId}-key">{secretLabel}</label>
      <input
        id="{serviceId}-key"
        type="password"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        placeholder={keyReusable ? 'Saved' : ''}
        aria-describedby="{serviceId}-key-hint"
        bind:value={apiKey}
        oninput={edited}
        disabled={busy}
      />
      <p class="hint" id="{serviceId}-key-hint">
        {#if keyReusable}
          {login ? 'A password' : 'A key'} is saved. Leave this blank to keep it.
        {:else}
          {credentialsHint}
        {/if}
      </p>
    </div>

    <div class="actions">
      <button class="button primary" type="submit" disabled={busy}>Save</button>
      <button class="button" type="button" onclick={test} disabled={busy}>Test connection</button>
    </div>

    <!-- Always present, so screen readers announce what appears inside it. -->
    <div role="status">
      {#if outcome}
        <div class="outcome">
          <StatusLamp tone={outcome.tone} label={outcome.label} />
          <div class="stack">
            <p class:error-text={outcome.tone === 'error'}>{outcome.text}</p>
            {#if offerSaveAnyway}
              <button class="button" type="button" onclick={() => save(true)} disabled={busy}>
                Save anyway
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </form>

  {#if saved.apiKeySaved}
    <section class="remove">
      {#if confirmingRemove}
        <p>
          Remove {serviceName}'s settings? Steerarr stops using {serviceName} until you set it up again.
        </p>
        <div class="actions">
          <button class="button danger" type="button" onclick={remove} disabled={busy}>
            Remove
          </button>
          <button class="button" type="button" onclick={() => (confirmingRemove = false)}>
            Cancel
          </button>
        </div>
      {:else}
        <button
          class="button danger"
          type="button"
          onclick={() => (confirmingRemove = true)}
          disabled={busy}
        >
          Remove settings
        </button>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .stack {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }

  form.stack {
    justify-items: stretch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .outcome,
  .load-error {
    display: flex;
    align-items: baseline;
    gap: 0.875rem;
  }

  .outcome .stack {
    gap: 0.75rem;
  }

  .error-text {
    color: var(--port);
  }

  .remove {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--rigging);
  }
</style>
