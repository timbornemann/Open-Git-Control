// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useOpenSettingsGroup } from '../useOpenSettingsGroup';
import { useSettingsNavigation } from '@/app/state/settingsNavigationStore';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), select: vi.fn() }));
vi.mock('@/contexts/AppStateContext', () => ({
  useOptionalUIContext: () => ({ setActiveTab: mocks.navigate }),
  useOptionalSettingsContext: () => ({ onSelectSettingsTab: mocks.select }),
}));
it('uses the existing guarded navigation and carries a focus destination without changing configuration', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let open!: ReturnType<typeof useOpenSettingsGroup>;
  const Harness = () => {
    open = useOpenSettingsGroup();
    return null;
  };
  act(() => root.render(createElement(Harness)));
  act(() => open!({ tab: 'api', id: 'ai-automation' }));
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('settings');
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith('api');
  expect(useSettingsNavigation.getState().destination).toEqual({ tab: 'api', id: 'ai-automation' });
  act(() => root.unmount());
  useSettingsNavigation.setState({ destination: null });
});
