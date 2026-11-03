import type { IpcRenderer } from 'electron';
import { TUTORIAL_CHANNELS, type TutorialControlApi } from '../../src/shared/tutorial/types';

export function createTutorialApi(ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>): TutorialControlApi {
  return {
    getTutorialProgress: () => ipc.invoke(TUTORIAL_CHANNELS.progress),
    acknowledgeTutorialWelcome: () => ipc.invoke(TUTORIAL_CHANNELS.acknowledge),
    startTutorial: (request) => ipc.invoke(TUTORIAL_CHANNELS.start, request),
    onTutorialClosed: (callback) => {
      const listener = (_event: unknown, failed: boolean) => callback(Boolean(failed));
      ipc.on('tutorial:closed', listener);
      return () => {
        ipc.removeListener('tutorial:closed', listener);
      };
    },
  };
}
