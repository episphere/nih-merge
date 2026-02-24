import type { MapStore } from 'nanostores';

/**
 * Bidirectional sync between a dashboard store and URL search params.
 *
 * - On call: reads URL params, merges with current state, and calls update() to resolve.
 * - On state change: serializes specified keys to URL via history.replaceState (debounced).
 *
 * Only the keys listed in `urlKeys` are serialized to the URL. Options arrays,
 * disabled flags, etc. are excluded — they're recomputed by the resolve function.
 */
export function syncStoreToURL<T extends object>(
  $state: MapStore<T>,
  update: (change: Partial<T>) => void,
  urlKeys: (keyof T & string)[],
): void {
  // Read URL → update store
  const params = new URLSearchParams(window.location.search);
  const fromURL: Partial<T> = {};
  for (const key of urlKeys) {
    const value = params.get(key);
    if (value !== null) {
      fromURL[key] = deserializeValue(value) as T[typeof key];
    }
  }
  if (Object.keys(fromURL).length > 0) {
    update(fromURL);
  }

  // Store → URL (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  $state.subscribe((state) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const params = new URLSearchParams();
      for (const key of urlKeys) {
        const value = state[key];
        params.set(key, serializeValue(value));
      }
      history.replaceState(null, '', '?' + params.toString());
    }, 100);
  });
}

function serializeValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

function deserializeValue(raw: string): unknown {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return raw;
}
