import { TUTORIAL_CHANNELS } from '../../src/shared/tutorial/types';

const tutorialContents = new Set<number>();
const hostChannels = new Set<string>([TUTORIAL_CHANNELS.context, TUTORIAL_CHANNELS.complete, TUTORIAL_CHANNELS.close, TUTORIAL_CHANNELS.ready]);

export function registerTutorialContents(id: number): () => void {
  tutorialContents.add(id);
  return () => tutorialContents.delete(id);
}

export function assertTutorialChannel(id: number, channel: string): void {
  if (tutorialContents.has(id) !== hostChannels.has(channel)) throw new Error('This IPC operation is not available in this renderer.');
}
