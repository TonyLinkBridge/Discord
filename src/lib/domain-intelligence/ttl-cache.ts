type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export function createTtlCache<K, V>(input: {
  maxEntries: number;
  now(): number;
}) {
  const entries = new Map<K, CacheEntry<V>>();

  function removeExpired() {
    const now = input.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= input.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key: K, value: V, ttlMs: number): void {
      removeExpired();
      entries.set(key, { value, expiresAt: input.now() + ttlMs });
      if (entries.size <= input.maxEntries) return;

      let oldestKey: K | undefined;
      let oldestExpiry = Number.POSITIVE_INFINITY;
      for (const [candidateKey, entry] of entries) {
        if (entry.expiresAt < oldestExpiry) {
          oldestExpiry = entry.expiresAt;
          oldestKey = candidateKey;
        }
      }
      if (oldestKey !== undefined) entries.delete(oldestKey);
    },

    clear(): void {
      entries.clear();
    },
  };
}
