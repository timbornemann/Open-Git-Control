// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemToolsList } from '../SystemToolsList';
import { useSystemTools } from '@/app/state/systemToolsStore';
import { appClient } from '@/services/appClient';
import { I18nProvider } from '@/i18n';

describe('unavailable automatic tool installation', () => {
  let root: Root;
  let host: HTMLDivElement;
  const render = () => act(() => root.render(createElement(I18nProvider, { language: 'en' }, createElement(SystemToolsList))));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useSystemTools.setState({
      reviewTool: null,
      checking: false,
      status: {
        platform: 'linux',
        checkedAt: 1,
        installation: null,
        tools: [
          {
            id: 'git',
            required: true,
            state: 'missing',
            downloadUrl: 'https://git-scm.com/install/linux',
            instructionsUrl: 'https://git-scm.com/install/linux',
            installation: {
              available: false,
              method: 'apt-get',
              source: 'system',
              packageName: 'git',
              command: 'apt-get install git',
              reason: 'No package manager found.',
            },
          },
        ],
      },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useSystemTools.setState({ status: null, reviewTool: null });
    vi.restoreAllMocks();
  });
  it('explains the missing installer and opens instructions without executing any command', () => {
    const install = vi.spyOn(appClient, 'installSystemTool');
    render();
    expect(button('Install').disabled).toBe(true);
    expect(host.textContent).toContain('No package manager found.');
    act(() => button('Installation instructions').click());
    expect(useSystemTools.getState().reviewTool).toBe('git');
    expect(install).not.toHaveBeenCalled();
    expect(button('Official download').disabled).toBe(false);
  });
  it('distinguishes an ongoing check and does not offer configuration while busy', () => {
    const status = useSystemTools.getState().status!;
    useSystemTools.setState({ status: { ...status, tools: [{ ...status.tools[0], state: 'checking' }] } });
    render();
    expect(host.textContent).toContain('Availability is still being checked.');
    expect(button('Installation instructions')).toBeUndefined();
    expect(button('Install').disabled).toBe(true);
  });
});
