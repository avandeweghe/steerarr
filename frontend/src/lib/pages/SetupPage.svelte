<script lang="ts">
  import AppSettingsLink from '../components/AppSettingsLink.svelte';
  import ArrSettingsForm from '../components/ArrSettingsForm.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import type { PageProps } from '../router.svelte';
  import { findService, loadServices } from '../services.svelte';

  /** Home of a service that isn't set up yet. Once saved, its real home replaces this page. */
  let { params }: PageProps = $props();

  const entry = $derived(findService(params.service));
</script>

{#if entry}
  {@const { id, name, credentials, credentialsHint } = entry.def}
  <PageHeader title={name} />
  <p class="intro">
    Connect Steerarr to {name}: enter the address you open {name} at and how to log in to it.
  </p>
  {#key id}
    <ArrSettingsForm
      serviceId={id}
      serviceName={name}
      {credentials}
      {credentialsHint}
      onsaved={loadServices}
      onremoved={loadServices}
    />
  {/key}
  <AppSettingsLink />
{/if}

<style>
  .intro {
    margin-bottom: 1.25rem;
    color: var(--fog);
  }
</style>
