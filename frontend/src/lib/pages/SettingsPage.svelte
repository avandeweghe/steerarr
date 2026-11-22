<script lang="ts">
  import AppSettingsLink from '../components/AppSettingsLink.svelte';
  import AddDefaultsSettings from '../components/AddDefaultsSettings.svelte';
  import ArrSettingsForm from '../components/ArrSettingsForm.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { cameFrom, navigate, type PageProps } from '../router.svelte';
  import { findService, loadServices } from '../services.svelte';

  /**
   * /<id>/settings: add, edit or remove a service. Reached from Settings (Add or Edit) or from
   * the gear on the service's own pages.
   */
  let { params }: PageProps = $props();

  const entry = $derived(findService(params.service));
  // Back to where it was opened from: Settings, or the service itself.
  const back = { href: cameFrom() ?? '/settings', label: 'Back' };

  /** Saved: open the service, which now has its tab. */
  async function opened(id: string): Promise<void> {
    await loadServices();
    navigate(`/${id}`, { replace: true });
  }

  /** Removed: back to Settings, since the service's own pages are gone. */
  async function removed(): Promise<void> {
    await loadServices();
    navigate('/settings', { replace: true });
  }
</script>

{#if entry}
  {@const { id, name, credentials, credentialsHint } = entry.def}
  <PageHeader title="{name} settings" {back} />
  {#key id}
    <ArrSettingsForm
      serviceId={id}
      serviceName={name}
      {credentials}
      {credentialsHint}
      onsaved={() => opened(id)}
      onremoved={removed}
    />
    {#if entry.def.adds && entry.configured}
      <AddDefaultsSettings serviceId={id} serviceName={name} noun={entry.def.adds} />
    {/if}
  {/key}
  <AppSettingsLink />
{/if}
