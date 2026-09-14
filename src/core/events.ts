export type EventMap = Record<string, unknown>;
export class TypedEmitter<E extends EventMap> {
  private readonly listeners = new Map<keyof E, Set<(value: never) => void>>();
  on<K extends keyof E>(name: K, listener: (value: E[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) { set = new Set(); this.listeners.set(name, set); }
    set.add(listener as (value: never) => void);
    return () => set?.delete(listener as (value: never) => void);
  }
  emit<K extends keyof E>(name: K, value: E[K]): void {
    for (const listener of this.listeners.get(name) ?? []) (listener as (value: E[K]) => void)(value);
  }
}
