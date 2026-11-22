<script lang="ts">
  import type { SonarrCalendarEpisode } from '@steerarr/shared';
  import { onMount } from 'svelte';
  import { errorMessage } from '../../../lib/api';
  import HeaderButton from '../../../lib/components/HeaderButton.svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import PullToRefresh from '../../../lib/components/PullToRefresh.svelte';
  import SettingsLink from '../../../lib/components/SettingsLink.svelte';
  import StatusLamp from '../../../lib/components/StatusLamp.svelte';
  import { dayNumber, formatDayHeading } from '../../../lib/format';
  import { getCalendar } from '../api';
  import CalendarItem from '../components/CalendarItem.svelte';
  import SonarrNav from '../components/SonarrNav.svelte';

  /** Sonarr's Calendar: monitored episodes airing from today on, two weeks at a time. */
  const refreshIcon = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';
  const STEP_DAYS = 14;
  /** The server allows 62 days at once. */
  const MAX_DAYS = 56;

  let days = $state(STEP_DAYS);
  let items = $state<SonarrCalendarEpisode[] | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  /** For telling aired from upcoming; moves on with each refresh. */
  let now = $state(Date.now());

  const groups = $derived.by(() => {
    const result: Array<{ day: number; heading: string; items: SonarrCalendarEpisode[] }> = [];
    for (const item of items ?? []) {
      const day = dayNumber(new Date(item.airDateUtc));
      const last = result.at(-1);
      if (last?.day === day) last.items.push(item);
      else result.push({ day, heading: formatDayHeading(item.airDateUtc), items: [item] });
    }
    return result;
  });

  const rangeText = $derived(
    days === STEP_DAYS ? 'the next 2 weeks' : `the next ${days / 7} weeks`,
  );

  onMount(() => {
    void load();
  });

  /** From the start of today, in the phone's own time zone. */
  function range(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return { start, end };
  }

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const { start, end } = range();
      items = await getCalendar(start, end);
      now = Date.now();
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

<PageHeader title="Sonarr">
  {#snippet actions()}
    <HeaderButton
      icon={refreshIcon}
      label="Refresh"
      onclick={load}
      disabled={loading}
      spinning={loading}
    />
    <SettingsLink serviceId="sonarr" serviceName="Sonarr" />
  {/snippet}
</PageHeader>

<SonarrNav />

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
    <p class="muted">No monitored episodes air in {rangeText}.</p>
  {:else}
    {#each groups as group (group.day)}
      <section>
        <h2>{group.heading}</h2>
        <ul>
          {#each group.items as item (item.id)}
            <CalendarItem {item} {now} />
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
