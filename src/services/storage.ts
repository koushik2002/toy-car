import { seed } from '../data/seed';
import type { State } from '../types';
const KEY = 'tiny-kars-demo-v1';
let memory: State | null = null;
let fallback = false;
export const storage = {
  load(): State {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const state = JSON.parse(raw);
        if (
          state.version === 1 &&
          Array.isArray(state.products) &&
          Array.isArray(state.orders) &&
          Array.isArray(state.users) &&
          state.tally &&
          Array.isArray(state.cart) &&
          Array.isArray(state.jobs) &&
          Array.isArray(state.offers)
        )
          return (memory = state);
      }
    } catch {
      fallback = true;
    }
    return (memory = seed());
  },
  save(state: State) {
    memory = state;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      fallback = false;
    } catch {
      fallback = true;
    }
  },
  isTemporary: () => fallback,
  invalidate() {
    memory = null;
  },
  key: KEY,
};
let state = storage.load();
const listeners = new Set<() => void>();
export const getState = () => state;
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function transact(fn: (draft: State) => void) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  storage.save(state);
  listeners.forEach((fn) => fn());
}
export function resetDemo() {
  state = seed();
  storage.save(state);
  listeners.forEach((fn) => fn());
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      storage.invalidate();
      state = storage.load();
      listeners.forEach((fn) => fn());
    }
  });
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
