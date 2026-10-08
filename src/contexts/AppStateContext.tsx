import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppStateSlicesValue, RepositoryContextValue, SettingsContextValue, UIContextValue, WorkflowContextValue } from './app-state/types';

export type {
  AppStateSlicesValue,
  AppStateUIState,
  BaseUIContextValue,
  CommitNavigationRequest,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from './app-state/types';

type AppStateStore = StoreApi<AppStateSlicesValue>;
type AppStateSliceKey = keyof AppStateSlicesValue;
type AnyFunction = (...args: never[]) => unknown;
type FunctionRef = { current: AnyFunction };
type SliceFunctionCache = {
  refs: Map<string, FunctionRef>;
  wrappers: Map<string, AnyFunction>;
};
type AppStateFunctionCache = Record<AppStateSliceKey, SliceFunctionCache>;

const AppStateStoreContext = createContext<AppStateStore | null>(null);

const appStateSliceKeys: AppStateSliceKey[] = ['settings', 'repository', 'workflow', 'ui'];

const createAppStateFunctionCache = (): AppStateFunctionCache => ({
  settings: { refs: new Map(), wrappers: new Map() },
  repository: { refs: new Map(), wrappers: new Map() },
  workflow: { refs: new Map(), wrappers: new Map() },
  ui: { refs: new Map(), wrappers: new Map() },
});

const isFunction = (value: unknown): value is AnyFunction => typeof value === 'function';

const getStableFunction = (cache: SliceFunctionCache, key: string, value: AnyFunction): AnyFunction => {
  let ref = cache.refs.get(key);
  if (!ref) {
    ref = { current: value };
    cache.refs.set(key, ref);
  }
  ref.current = value;

  let wrapper = cache.wrappers.get(key);
  if (!wrapper) {
    wrapper = ((...args: never[]) => ref.current(...args)) as AnyFunction;
    cache.wrappers.set(key, wrapper);
  }
  return wrapper;
};

const materializeSlice = <T extends Record<string, unknown>>(slice: T, cache: SliceFunctionCache): T => {
  const materialized = {} as T;
  for (const [key, value] of Object.entries(slice)) {
    materialized[key as keyof T] = (isFunction(value) ? getStableFunction(cache, key, value) : value) as T[keyof T];
  }
  return materialized;
};

const materializeAppStateSlices = (value: AppStateSlicesValue, cache: AppStateFunctionCache): AppStateSlicesValue => ({
  settings: materializeSlice(value.settings as unknown as Record<string, unknown>, cache.settings) as SettingsContextValue,
  repository: materializeSlice(value.repository as unknown as Record<string, unknown>, cache.repository) as RepositoryContextValue,
  workflow: materializeSlice(value.workflow as unknown as Record<string, unknown>, cache.workflow) as WorkflowContextValue,
  ui: materializeSlice(value.ui as unknown as Record<string, unknown>, cache.ui) as UIContextValue,
});

const areRenderableSliceFieldsEqual = (current: Record<string, unknown>, next: Record<string, unknown>): boolean => {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) return false;

  for (const key of nextKeys) {
    const currentValue = current[key];
    const nextValue = next[key];
    if (isFunction(currentValue) && isFunction(nextValue)) continue;
    if (!Object.is(currentValue, nextValue)) return false;
  }
  return true;
};

const reconcileAppStateSlices = (current: AppStateSlicesValue, nextValue: AppStateSlicesValue, cache: AppStateFunctionCache): AppStateSlicesValue => {
  const next = materializeAppStateSlices(nextValue, cache);
  let changed = false;
  const reconciled = {} as AppStateSlicesValue;

  for (const key of appStateSliceKeys) {
    const currentSlice = current[key] as unknown as Record<string, unknown>;
    const nextSlice = next[key] as unknown as Record<string, unknown>;
    const sliceChanged = !areRenderableSliceFieldsEqual(currentSlice, nextSlice);
    reconciled[key] = (sliceChanged ? next[key] : current[key]) as never;
    changed = changed || sliceChanged;
  }

  return changed ? reconciled : current;
};

const createAppStateStore = (initialValue: AppStateSlicesValue, cache: AppStateFunctionCache): AppStateStore =>
  createStore<AppStateSlicesValue>()(() => materializeAppStateSlices(initialValue, cache));

const useAppStateSelector = <T,>(selector: (state: AppStateSlicesValue) => T, hookName: string): T => {
  const store = useContext(AppStateStoreContext);
  if (!store) throw new Error(`${hookName} must be used within AppStateSlicesProvider`);
  return useStore(store, selector);
};

export const useSettingsStore = <T,>(selector: (state: SettingsContextValue) => T): T =>
  useAppStateSelector((state) => selector(state.settings), 'useSettingsStore');
export const useGitStore = <T,>(selector: (state: RepositoryContextValue) => T): T => useAppStateSelector((state) => selector(state.repository), 'useGitStore');
export const useWorkflowStore = <T,>(selector: (state: WorkflowContextValue) => T): T =>
  useAppStateSelector((state) => selector(state.workflow), 'useWorkflowStore');
export const useUIStore = <T,>(selector: (state: UIContextValue) => T): T => useAppStateSelector((state) => selector(state.ui), 'useUIStore');
/** Read the current selection after an asynchronous repository activation. */
export const useAppStateReader = () => {
  const store = useContext(AppStateStoreContext);
  if (!store) throw new Error('useAppStateReader must be used within AppStateSlicesProvider');
  return store.getState;
};

export const useSettingsContext = () => useSettingsStore((state) => state);
export const useRepositoryContext = () => useGitStore((state) => state);
export const useOptionalRepositoryContext = () => {
  const store = useContext(AppStateStoreContext);
  return store?.getState().repository ?? null;
};
const subscribeToNothing = () => () => {};
/** Settings can edit global Git identity even with no repository selected. */
export const useOptionalActiveRepository = () => {
  const store = useContext(AppStateStoreContext);
  return useSyncExternalStore(store?.subscribe || subscribeToNothing, () => store?.getState().repository.activeRepo || null);
};
export const useWorkflowContext = () => useWorkflowStore((state) => state);
export const useUIContext = () => useUIStore((state) => state);
export const useOptionalUIContext = () => {
  const store = useContext(AppStateStoreContext);
  return store?.getState().ui ?? null;
};
export const useOptionalSettingsContext = () => {
  const store = useContext(AppStateStoreContext);
  return store?.getState().settings ?? null;
};

export const AppStateSlicesProvider = ({ value, children }: { value: AppStateSlicesValue; children: ReactNode }) => {
  const storeRef = useRef<AppStateStore | null>(null);
  const functionCacheRef = useRef<AppStateFunctionCache | null>(null);
  if (!functionCacheRef.current) {
    functionCacheRef.current = createAppStateFunctionCache();
  }
  if (!storeRef.current) {
    storeRef.current = createAppStateStore(value, functionCacheRef.current);
  }

  useLayoutEffect(() => {
    const cache = functionCacheRef.current;
    if (!cache) return;
    storeRef.current?.setState((current) => reconcileAppStateSlices(current, value, cache));
  }, [value]);

  return <AppStateStoreContext.Provider value={storeRef.current}>{children}</AppStateStoreContext.Provider>;
};
