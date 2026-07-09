import { createContext, useContext, type Context, type ReactNode } from 'react';
import type {
  AppStateSlicesValue,
  GithubContextValue,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from './app-state/types';

export type {
  AppContextValue,
  AppStateSlicesValue,
  BaseUIContextValue,
  CommitNavigationRequest,
  GithubContextValue,
  RepositoryContextValue,
  SettingsContextValue,
  UIContextValue,
  WorkflowContextValue,
} from './app-state/types';
export { createAppStateSlices } from './app-state/createAppStateSlices';

const SettingsContext = createContext<SettingsContextValue | null>(null);
const RepositoryContext = createContext<RepositoryContextValue | null>(null);
const GithubContext = createContext<GithubContextValue | null>(null);
const WorkflowContext = createContext<WorkflowContextValue | null>(null);
const UIContext = createContext<UIContextValue | null>(null);

const useRequiredContext = <T,>(context: Context<T | null>, hookName: string): T => {
  const ctx = useContext(context);
  if (!ctx) throw new Error(`${hookName} must be used within AppStateSlicesProvider`);
  return ctx;
};

export const useSettingsContext = () => useRequiredContext(SettingsContext, 'useSettingsContext');
export const useRepositoryContext = () => useRequiredContext(RepositoryContext, 'useRepositoryContext');
export const useGithubContext = () => useRequiredContext(GithubContext, 'useGithubContext');
export const useWorkflowContext = () => useRequiredContext(WorkflowContext, 'useWorkflowContext');
export const useUIContext = () => useRequiredContext(UIContext, 'useUIContext');
export const useOptionalUIContext = () => useContext(UIContext);

export const AppStateSlicesProvider = ({ value, children }: { value: AppStateSlicesValue; children: ReactNode }) => (
  <SettingsContext.Provider value={value.settings}>
    <RepositoryContext.Provider value={value.repository}>
      <GithubContext.Provider value={value.github}>
        <WorkflowContext.Provider value={value.workflow}>
          <UIContext.Provider value={value.ui}>{children}</UIContext.Provider>
        </WorkflowContext.Provider>
      </GithubContext.Provider>
    </RepositoryContext.Provider>
  </SettingsContext.Provider>
);
