import { getElectronApi, requireElectronAppApi } from './electronApi';

export const clipboardClient = {
  isAvailable: () => typeof getElectronApi()?.app?.writeClipboardText === 'function',
  writeText: (text: string) => requireElectronAppApi().writeClipboardText(text),
};
