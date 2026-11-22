<script lang="ts">
  import type { AuthSettingsRequest, AuthStatus } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../api';
  import { getAuthStatus, logOut, logOutOthers, saveAuthSettings } from '../auth-api';
  import { session } from '../auth.svelte';
  import StatusLamp, { type LampTone } from './StatusLamp.svelte';

  /** The Login section of Settings: turn Steerarr's login on or off, change it, log out. */
  const MIN_PASSWORD = 8;

  let status = $state<AuthStatus | null>(null);
  let loadError = $state<string | null>(null);
  let enabled = $state(false);
  let username = $state('');
  let newPassword = $state('');
  let repeatPassword = $state('');
  let currentPassword = $state('');
  let busy = $state(false);
  let outcome = $state<{ tone: LampTone; text: string } | null>(null);

  const isOn = $derived(status?.enabled ?? false);

  const intro = $derived.by(() => {
    if (isOn) return 'On: every device has to log in to use Steerarr.';
    return 'Off: anyone who can reach Steerarr can use it. Turn it on to ask for a username and password.';
  });

  /** What's wrong with the form, checked before asking Steerarr. */
  const problem = $derived.by(() => {
    if (isOn && !currentPassword) return 'Enter the current password to change the login.';
    if (!enabled) return null;
    if (!username.trim()) return 'Choose a username.';
    if (!isOn && !newPassword) return 'Choose a password.';
    if (newPassword && newPassword.length < MIN_PASSWORD) {
      return `Use a password of at least ${MIN_PASSWORD} characters.`;
    }
    if (newPassword !== repeatPassword) return "The two passwords don't match.";
    return null;
  });

  onMount(async () => {
    try {
      apply(await getAuthStatus());
    } catch (err) {
      loadError = errorMessage(err);
    }
  });

  function apply(next: AuthStatus): void {
    status = next;
    enabled = next.enabled;
    username = next.username ?? '';
    newPassword = '';
    repeatPassword = '';
    currentPassword = '';
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy || !status) return;
    if (problem) {
      outcome = { tone: 'error', text: problem };
      return;
    }
    const request: AuthSettingsRequest = { enabled };
    if (enabled) request.username = username.trim();
    if (enabled && newPassword) request.newPassword = newPassword;
    if (currentPassword) request.currentPassword = currentPassword;
    const wasOn = status.enabled;

    busy = true;
    outcome = null;
    try {
      const next = await saveAuthSettings(request);
      apply(next);
      outcome = { tone: 'ok', text: savedText(wasOn, next.enabled) };
    } catch (err) {
      outcome = { tone: 'error', text: errorMessage(err) };
    } finally {
      busy = false;
    }
  }

  function savedText(wasOn: boolean, isNowOn: boolean): string {
    if (!isNowOn) return 'Login turned off.';
    if (!wasOn) return 'Login turned on. Other devices now have to log in.';
    return 'Saved. If the username or password changed, other devices have to log in again.';
  }

  let confirmingOthers = $state(false);
  let loggingOutOthers = $state(false);

  async function logOutEveryOtherDevice(): Promise<void> {
    loggingOutOthers = true;
    try {
      await logOutOthers();
      confirmingOthers = false;
      outcome = { tone: 'ok', text: 'Every other device is logged out. This one stays logged in.' };
    } catch (err) {
      outcome = { tone: 'error', text: `Couldn't log out the other devices. ${errorMessage(err)}` };
    } finally {
      loggingOutOthers = false;
    }
  }

  async function logOutHere(): Promise<void> {
    try {
      await logOut();
      session.loginRequired = true;
    } catch (err) {
      outcome = { tone: 'error', text: errorMessage(err) };
    }
  }
</script>

<section>
  <h2>Login</h2>
  {#if loadError}
    <p class="problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't load the login settings. {loadError}</span>
    </p>
  {:else if !status}
    <p class="muted">Loading…</p>
  {:else}
    <p class="muted intro">{intro}</p>

    <form class="form" onsubmit={save}>
      <label class="check">
        <input type="checkbox" bind:checked={enabled} />
        Ask for a username and password
      </label>

      {#if enabled}
        <div class="field">
          <label for="auth-username">Username</label>
          <input
            id="auth-username"
            bind:value={username}
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
          />
        </div>
        <div class="field">
          <label for="auth-new">{isOn ? 'New password' : 'Password'}</label>
          <input
            id="auth-new"
            type="password"
            bind:value={newPassword}
            autocomplete="new-password"
          />
          <p class="hint">
            {isOn ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          </p>
        </div>
        <div class="field">
          <label for="auth-repeat">Repeat the password</label>
          <input
            id="auth-repeat"
            type="password"
            bind:value={repeatPassword}
            autocomplete="new-password"
          />
        </div>
      {/if}

      {#if isOn}
        <div class="field">
          <label for="auth-current">Current password</label>
          <input
            id="auth-current"
            type="password"
            bind:value={currentPassword}
            autocomplete="current-password"
          />
          <p class="hint">Needed for any change to the login, including turning it off.</p>
        </div>
      {/if}

      {#if outcome}
        <p class="status" role="status">
          <StatusLamp tone={outcome.tone} label={outcome.tone === 'ok' ? 'Done' : 'Failed'} />
          <span>{outcome.text}</span>
        </p>
      {/if}

      <div class="buttons">
        <button class="button primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {#if isOn}
          <button class="button" type="button" onclick={logOutHere}>Log out</button>
        {/if}
      </div>
    </form>

    {#if isOn}
      <div class="others">
        <h3>Devices</h3>
        <p class="hint">
          Each device stays logged in until it logs out, as long as Steerarr is opened on it at
          least once a year.
        </p>
        {#if confirmingOthers}
          <p>Log out every other device? They'll need the username and password again.</p>
          <div class="buttons">
            <button
              class="button danger"
              type="button"
              disabled={loggingOutOthers}
              onclick={logOutEveryOtherDevice}
            >
              {loggingOutOthers ? 'Logging out…' : 'Log them out'}
            </button>
            <button class="button" type="button" onclick={() => (confirmingOthers = false)}>
              Cancel
            </button>
          </div>
        {:else}
          <button class="button" type="button" onclick={() => (confirmingOthers = true)}>
            Log out all other devices
          </button>
        {/if}
      </div>
    {/if}

    <p class="hint recovery">
      Forgot the password? Delete auth.json from Steerarr's data folder and restart Steerarr: the
      login is then off, and your service settings stay.
    </p>
  {/if}
</section>

<style>
  h2 {
    font-size: var(--size-heading);
  }

  .others {
    display: grid;
    gap: 0.625rem;
    justify-items: start;
    margin-top: 1.5rem;
    font-size: var(--size-secondary);
  }

  h3 {
    font-size: 1.125rem;
  }

  .intro {
    margin: 0.375rem 0 1rem;
    font-size: var(--size-secondary);
  }

  .form {
    display: grid;
    gap: 1rem;
  }

  .status {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .recovery {
    margin-top: 1.5rem;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.875rem;
  }
</style>
