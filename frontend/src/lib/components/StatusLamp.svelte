<script lang="ts" module>
  /**
   * A navigation-light status dot: ok = starboard green, error = port red,
   * warn = lantern amber, pending = unlit fog grey (gently pulsing).
   */
  export type LampTone = 'ok' | 'error' | 'warn' | 'pending';
</script>

<script lang="ts">
  let { tone, label }: { tone: LampTone; label: string } = $props();
</script>

<span class="lamp {tone}" role="img" aria-label={label}></span>

<style>
  .lamp {
    flex: none;
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--lamp);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--lamp) 18%, transparent),
      0 0 10px 1px color-mix(in srgb, var(--lamp) 55%, transparent);
  }

  .ok {
    --lamp: var(--starboard);
  }

  .error {
    --lamp: var(--port);
  }

  .warn {
    --lamp: var(--lantern);
  }

  .pending {
    --lamp: var(--fog);
    box-shadow: none;
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
