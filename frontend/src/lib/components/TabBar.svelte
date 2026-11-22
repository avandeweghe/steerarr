<script lang="ts" module>
  /** One tab: Home, or a service (its id is the first part of its paths). */
  export interface Tab {
    path: string;
    name: string;
    icon: string;
  }
</script>

<script lang="ts">
  let { tabs, currentPath }: { tabs: Tab[]; currentPath: string } = $props();

  /** Home only for '/', a service for its own pages. */
  function isActive(tab: Tab): boolean {
    if (tab.path === '/') return currentPath === '/';
    return currentPath === tab.path || currentPath.startsWith(`${tab.path}/`);
  }
</script>

<nav class="tabbar" aria-label="Sections">
  {#each tabs as tab (tab.path)}
    {@const active = isActive(tab)}
    <a href={`#${tab.path}`} class:active aria-current={active ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={tab.icon} />
      </svg>
      <span>{tab.name}</span>
    </a>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: color-mix(in srgb, var(--hull) 94%, transparent);
    border-top: 1px solid var(--rigging);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  a {
    flex: 1;
    max-width: 8rem;
    min-height: var(--tabbar-height);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    color: var(--fog);
    font-size: 0.6875rem;
    font-weight: 500;
    text-decoration: none;
    touch-action: manipulation;
  }

  a.active {
    color: var(--brass);
  }

  svg {
    width: 1.625rem;
    height: 1.625rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
