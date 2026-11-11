export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

/** Minimal event emitter (Observer pattern). */
export class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
}

/** Observable state container compatible with React's useSyncExternalStore. */
export class Store<S> {
  private state: S;
  private readonly emitter = new Emitter<S>();

  constructor(initial: S) {
    this.state = initial;
  }

  getState = (): S => this.state;

  subscribe = (listener: Listener<S>): Unsubscribe => this.emitter.subscribe(listener);

  protected setState(patch: Partial<S> | ((prev: S) => Partial<S>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.emitter.emit(this.state);
  }
}
