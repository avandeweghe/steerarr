/**
 * Whether a service's library list shows monitored items only. Kept on this device, per
 * service; on unless turned off, since big libraries are mostly things nobody watches for.
 */
export function loadMonitoredOnly(serviceId: string): boolean {
  try {
    return localStorage.getItem(key(serviceId)) !== 'false';
  } catch {
    // Storage can be unavailable (private mode).
    return true;
  }
}

export function saveMonitoredOnly(serviceId: string, monitoredOnly: boolean): void {
  try {
    localStorage.setItem(key(serviceId), String(monitoredOnly));
  } catch {
    // Not being able to remember it is fine.
  }
}

function key(serviceId: string): string {
  return `steerarr:${serviceId}:monitored-only`;
}
