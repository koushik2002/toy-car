import { useSyncExternalStore } from 'react';
import { subscribe, getState } from '../services/storage';
export function useStore() {
  return useSyncExternalStore(subscribe, getState, getState);
}
