// 自研外部状态库（替代 Zustand，遵守零第三方依赖）
// 用法：const state = store.getState(); store.setState({...}); unsubscribe = store.subscribe(sel, cb)
export interface Store<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: <U>(selector: (s: T) => U, listener: (u: U, prev: U) => void) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = initial;
  const subs = new Set<{ selector: (s: T) => unknown; listener: (u: unknown, p: unknown) => void; last: unknown }>();

  function getState(): T {
    return state;
  }

  function setState(partial: Partial<T> | ((s: T) => Partial<T>)): void {
    const patch = typeof partial === "function" ? (partial as (s: T) => Partial<T>)(state) : partial;
    state = { ...state, ...patch };
    for (const sub of subs) {
      const next = sub.selector(state);
      if (!Object.is(next, sub.last)) {
        const prev = sub.last;
        sub.last = next;
        sub.listener(next, prev);
      }
    }
  }

  function subscribe<U>(selector: (s: T) => U, listener: (u: U, prev: U) => void): () => void {
    const sub = { selector: selector as (s: T) => unknown, listener: listener as (u: unknown, p: unknown) => void, last: selector(state) };
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }

  return { getState, setState, subscribe };
}

// 浅比较选择器辅助：多个值一起订阅时用
export function shallowEq(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}