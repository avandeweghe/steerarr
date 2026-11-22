<script lang="ts">
  import { onMount, tick, type Component } from 'svelte';
  import { session } from './lib/auth.svelte';
  import TabBar, { type Tab } from './lib/components/TabBar.svelte';
  import UpdateBar from './lib/components/UpdateBar.svelte';
  import AppSettingsPage from './lib/pages/AppSettingsPage.svelte';
  import HomePage from './lib/pages/HomePage.svelte';
  import LoginPage from './lib/pages/LoginPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import SetupPage from './lib/pages/SetupPage.svelte';
  import { matchRoute, navigate, router, type PageProps, type Route } from './lib/router.svelte';
  import { findService, loadServices, services } from './lib/services.svelte';
  import { watchForUpdates } from './lib/version.svelte';

  /** A house: the Home tab. */
  const homeIcon = 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5';

  /**
   * Route order matters (first match wins):
   * 1. / (Home), /settings for Steerarr itself, and /<id>/settings for every service,
   * 2. the pages of services that are set up,
   * 3. /<id> as the setup form for services that aren't (set-up ones matched their home in 2).
   */
  const routes = $derived.by((): Route[] => [
    { path: '/', component: HomePage },
    { path: '/settings', component: AppSettingsPage },
    { path: '/:service/settings', component: SettingsPage },
    ...(services.items ?? [])
      .filter((entry) => entry.configured)
      .flatMap((entry) => entry.def.routes),
    { path: '/:service', component: SetupPage },
  ]);

  const match = $derived.by(() => {
    const found = matchRoute(routes, router.path);
    // The generic routes only apply to services that exist.
    if (found && 'service' in found.params && !findService(found.params.service)) return null;
    return found;
  });

  /** Home, then each service that's set up. Services are added in Settings. */
  const tabs = $derived.by((): Tab[] => {
    if (session.loginRequired || !services.items) return [];
    const configured = services.items.filter((entry) => entry.configured);
    return [
      { path: '/', name: 'Home', icon: homeIcon },
      ...configured.map(({ def }) => ({ path: `/${def.id}`, name: def.name, icon: def.icon })),
    ];
  });

  async function retry(): Promise<void> {
    services.error = null;
    await loadServices();
  }

  onMount(loadServices);
  onMount(watchForUpdates);

  // Send unknown paths Home.
  $effect(() => {
    if (services.items && !match) navigate('/', { replace: true });
  });

  // A new page starts at the top; going back returns to where you were (see router).
  $effect(() => {
    void router.path;
    void tick().then(() => window.scrollTo(0, router.scrollTarget));
  });
</script>

<UpdateBar />

<main class:with-tabs={tabs.length > 0}>
  {#if session.loginRequired}
    <LoginPage />
  {:else if services.error && services.items === null}
    <div class="notice">
      <h1>Can't reach Steerarr</h1>
      <p class="muted">{services.error}</p>
      <button class="button primary" type="button" onclick={retry}>Try again</button>
    </div>
  {:else if services.items === null}
    <p class="muted loading">Loading…</p>
  {:else if services.items.length === 0}
    <div class="notice">
      <h1>No services available</h1>
      <p class="muted">This version of Steerarr doesn't include any services.</p>
    </div>
  {:else if match}
    <!-- Pages without props simply ignore `params`. -->
    {@const Page = match.route.component as Component<PageProps>}
    <Page params={match.params} />
  {/if}
</main>

{#if tabs.length > 0}
  <TabBar {tabs} currentPath={router.path} />
{/if}

<style>
  main {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 calc(var(--gutter) + var(--safe-right)) var(--gutter)
      calc(var(--gutter) + var(--safe-left));
  }

  main.with-tabs {
    padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--gutter));
  }

  .loading {
    padding-top: calc(var(--safe-top) + 2rem);
  }

  .notice {
    display: grid;
    gap: 0.875rem;
    justify-items: start;
    padding-top: calc(var(--safe-top) + 3rem);
    max-width: 30rem;
  }

  .notice h1 {
    font-size: var(--size-heading);
  }
</style>
