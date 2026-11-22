<script lang="ts">
  import GearLink from './GearLink.svelte';

  /** Gear button to a service's settings page, for PageHeader's actions. */
  let { serviceId, serviceName }: { serviceId: string; serviceName: string } = $props();
</script>

<GearLink href={`#/${serviceId}/settings`} label="{serviceName} settings" />
