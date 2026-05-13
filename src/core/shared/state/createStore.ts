import { map, type MapStore } from 'nanostores';

export interface DashboardStore<T extends object> {
  $state: MapStore<T>;
  update(change: Partial<T>): void;
}

/**
 * Creates a dashboard store backed by a nanostore map.
 * All state changes go through the resolve function, which applies constraint rules
 * and returns the fully valid new state.
 *
 * UI controls should call update() — never write to $state directly.
 */
export function createDashboardStore<T extends object>(
  initialState: T,
  resolve: (state: T, change: Partial<T>) => T,
): DashboardStore<T> {
  const $state = map<T>(resolve(initialState, {}));

  function update(change: Partial<T>) {
    if (Object.keys(change).length === 0) return;
    const resolved = resolve($state.get(), change);
    $state.set(resolved);
  }

  return { $state, update };
}
