/** The few EventEmitter methods GameService uses, so the server code runs in a browser. */
type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  setMaxListeners(_n: number) {
    return this;
  }

  on(event: string, fn: Listener) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }

  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    const set = this.listeners.get(event);
    if (!set?.size) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }
}
