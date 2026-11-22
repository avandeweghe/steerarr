<script lang="ts">
  import AboutSettings from '../components/AboutSettings.svelte';
  import LoginSettings from '../components/LoginSettings.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ServicesSettings from '../components/ServicesSettings.svelte';
  import { cameFrom } from '../router.svelte';

  /** /settings: the services, the optional login, and About. */

  // Back to wherever this page was opened from, usually Home.
  const back = { href: cameFrom() ?? '/', label: 'Back' };
</script>

<PageHeader title="Settings" {back} />

<div class="sections">
  <ServicesSettings />
  <LoginSettings />
  <AboutSettings />
</div>

<style>
  .sections {
    display: grid;
    gap: 2.25rem;
  }
</style>
