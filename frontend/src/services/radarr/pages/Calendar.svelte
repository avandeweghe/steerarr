<script lang="ts">
  import type { RadarrCalendarEntry } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { formatDayHeading } from '../../../lib/format';
  import { getCalendar } from '../api';
  import CalendarItem from '../components/CalendarItem.svelte';
  import RadarrNav from '../components/RadarrNav.svelte';

  /** Radarr's Calendar: monitored movies' cinema, digital and physical releases, from today on. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const STEP_DAYS = 14;
  /** The server allows 62 days at once. */
  const MAX_DAYS = 56;

  let days = $state(STEP_DAYS);
  let items = $state<RadarrCalendarEntry[] | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  const groups = $derived.by(() => {
    const result: Array<{ day: string; heading: string; items: RadarrCalendarEntry[] }> = [];
    for (const item of items ?? []) {
      // Release dates are whole days (midnight UTC): group by the date itself, not local time.
      const day = item.date.slice(0, 10);
      const last = result.at(-1);
      if (last?.day === day) last.items.push(item);
      else result.push({ day, heading: formatDayHeading(`${day}T12:00:00`), items: [item] });
    }
    return result;
  });

  const rangeText = $derived(
    days === STEP_DAYS ? 'the next 2 weeks' : `the next ${days / 7} weeks`,
  );

  onMount(() => {
    void load();
  });

  /** From today's date on. Release dates are whole days, kept as midnight UTC. */
  function range(): { start: Date; end: Date } {
    const today = new Date();
    const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days);
    return { start, end };
  }

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const { start, end } = range();
      items = await getCalendar(start, end);
      error = null;
    } catch (err) {
      error = errorMessage(err);
    } finally {
      loading = false;
    }
  }

  function showMore(): Promise<void> {
    days = Math.min(days + STEP_DAYS, MAX_DAYS);
    return load();
  }
</script>

<PageHeader title="Radarr">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="radarr" serviceName="Radarr" />
  {/snippet}
</PageHeader>

<RadarrNav />

<PullToRefresh onrefresh={load}>
  {#if error}
    <p class="problem" role="alert">
      <StatusLamp tone="error" label="Failed" />
      <span>Couldn't load the calendar. {error}</span>
    </p>
  {/if}

  {#if items === null}
    {#if !error}<p class="muted">Loading…</p>{/if}
  {:else if items.length === 0}
    <p class="muted">No monitored movies come out in {rangeText}.</p>
  {:else}
    {#each groups as group (group.day)}
      <section>
        <h2>{group.heading}</h2>
        <ul>
          {#each group.items as item (`${item.movieId}:${item.kind}`)}
            <CalendarItem {item} />
          {/each}
        </ul>
      </section>
    {/each}
  {/if}

  {#if items !== null && days < MAX_DAYS}
    <button class="button more" type="button" onclick={showMore} disabled={loading}>
      {loading ? 'Loading…' : 'Show 2 more weeks'}
    </button>
  {/if}
</PullToRefresh>

<style>
  section + section {
    margin-top: 1.25rem;
  }

  h2 {
    font-size: var(--size-heading);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .problem {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    margin: 0.5rem 0;
    font-size: var(--size-secondary);
  }

  .more {
    margin-top: 1rem;
  }
</style>
