import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  AppStateSlicesValue,
  GithubContextValue,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from './app-state/types';

export type {
  AppStateSlicesValue,
  AppStateUIState,
  BaseUIContextValue,
  CommitNavigationRequest,
  GithubContextValue,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from './app-state/types';

type AppStateStore = StoreApi<AppStateSlicesValue>;

const AppStateStoreContext = createContext<AppStateStore | null>(null);

const createAppStateStore = (initialValue: AppStateSlicesValue): AppStateStore => createStore<AppStateSlicesValue>()(() => initialValue);

const useAppStateSelector = <T,>(selector: (state: AppStateSlicesValue) => T, hookName: string): T => {
  const store = useContext(AppStateStoreContext);
  if (!store) throw new Error(`${hookName} must be used within AppStateSlicesProvider`);
  return useStore(store, selector);
};

export const useSettingsStore = <T,>(selector: (state: SettingsContextValue) => T): T =>
  useAppStateSelector((state) => selector(state.settings), 'useSettingsStore');
export const useGitStore = <T,>(selector: (state: RepositoryContextValue) => T): T => useAppStateSelector((state) => selector(state.repository), 'useGitStore');
export const useGitHubStore = <T,>(selector: (state: GithubContextValue) => T): T => useAppStateSelector((state) => selector(state.github), 'useGitHubStore');
export const useWorkflowStore = <T,>(selector: (state: WorkflowContextValue) => T): T =>
  useAppStateSelector((state) => selector(state.workflow), 'useWorkflowStore');
export const useUIStore = <T,>(selector: (state: UIContextValue) => T): T => useAppStateSelector((state) => selector(state.ui), 'useUIStore');

export const useSettingsContext = () => useSettingsStore((state) => state);
export const useRepositoryContext = () => useGitStore((state) => state);
export const useGithubContext = () => useGitHubStore((state) => state);
export const useWorkflowContext = () => useWorkflowStore((state) => state);
export const useUIContext = () => useUIStore((state) => state);
export const useOptionalUIContext = () => {
  const store = useContext(AppStateStoreContext);
  return store?.getState().ui ?? null;
};

export const AppStateSlicesProvider = ({ value, children }: { value: AppStateSlicesValue; children: ReactNode }) => {
  const storeRef = useRef<AppStateStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppStateStore(value);
  }

  useLayoutEffect(() => {
    storeRef.current?.setState(value, true);
  }, [value]);

  return <AppStateStoreContext.Provider value={storeRef.current}>{children}</AppStateStoreContext.Provider>;
};
