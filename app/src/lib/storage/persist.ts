export type PersistState = 'persisted' | 'denied' | 'unsupported';

export async function persistedState(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'persisted' : 'denied';
}

/** Ask the browser not to evict our data. Safe to call repeatedly. */
export async function requestPersistence(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'denied';
  }
}
