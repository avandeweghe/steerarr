<script lang="ts">
  import { errorMessage } from '../api';
  import { logIn } from '../auth-api';
  import { session } from '../auth.svelte';
  import StatusLamp from '../components/StatusLamp.svelte';
  import { loadServices, services } from '../services.svelte';

  /** Shown instead of the app while Steerarr's login is on and this device isn't logged in. */
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await logIn(username.trim(), password);
      password = '';
      // Load first, so the app doesn't flash the error from the load that needed a login.
      await loadServices();
      if (services.error) error = services.error;
      else session.loginRequired = false;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <img src="icon.svg" alt="" width="72" height="72" />
  <h1>Steerarr</h1>

  <form onsubmit={submit}>
    <div class="field">
      <label for="login-username">Username</label>
      <input
        id="login-username"
        bind:value={username}
        autocomplete="username"
        autocapitalize="off"
        spellcheck="false"
        required
      />
    </div>
    <div class="field">
      <label for="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        required
      />
    </div>

    {#if error}
      <p class="error" role="alert">
        <StatusLamp tone="error" label="Failed" />
        <span>{error}</span>
      </p>
    {/if}

    <button class="button primary" type="submit" disabled={busy}>
      {busy ? 'Logging in…' : 'Log in'}
    </button>
  </form>
</div>

<style>
  .login {
    display: grid;
    gap: 1rem;
    justify-items: center;
    max-width: 22rem;
    margin: 0 auto;
    padding: calc(var(--safe-top) + 3rem) 0 2rem;
  }

  img {
    border-radius: 16px;
  }

  h1 {
    font-size: var(--size-title);
  }

  form {
    display: grid;
    gap: 1rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .error {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    font-size: var(--size-secondary);
  }
</style>
