import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TutorialProgressStore } from '../tutorialProgress';
import { assertTutorialChannel, registerTutorialContents } from '../tutorialAuthorization';
import { resolveTutorialRequest, TUTORIAL_CHAPTERS } from '../../../src/shared/tutorial/catalog';
import { TUTORIAL_CHANNELS } from '../../../src/shared/tutorial/types';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tutorial-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('tutorial first-run classification and persistence', () => {
  it('welcomes a fresh profile once, even when Electron has already created caches', () => {
    fs.mkdirSync(path.join(root, 'GPUCache'));
    const store = new TutorialProgressStore(root);
    expect(store.snapshot().welcomeSeen).toBe(false);
    store.acknowledge();
    expect(new TutorialProgressStore(root).snapshot().welcomeSeen).toBe(true);
  });
  it.each(['settings.json', 'repos.json', 'hosting-connections.json', 'window-state-v1.json', 'startup.log', 'Local Storage'])(
    'treats existing %s as a legacy profile',
    (file) => {
      fs.writeFileSync(path.join(root, file), '');
      expect(new TutorialProgressStore(root).snapshot().welcomeSeen).toBe(true);
    },
  );
  it('preserves a corrupt marker and never welcomes an uncertain profile', () => {
    fs.writeFileSync(path.join(root, 'tutorial-progress-v1.json'), '{broken');
    expect(new TutorialProgressStore(root).snapshot().welcomeSeen).toBe(true);
    expect(fs.readFileSync(path.join(root, 'tutorial-progress-v1.json'), 'utf8')).toBe('{broken');
  });
  it('persists deduplicated completions, drops unknown chapters and returns defensive copies', () => {
    const store = new TutorialProgressStore(root);
    store.complete('basics');
    store.complete('basics');
    store.snapshot().completedChapters.push('hosting');
    expect(new TutorialProgressStore(root).snapshot().completedChapters).toEqual(['basics']);
    expect(() => store.complete('missing')).toThrow('Unknown');
  });
  it('rejects invalid and unknown chapter/step requests', () => {
    expect(() => resolveTutorialRequest(null)).toThrow();
    expect(() => resolveTutorialRequest({ chapterId: 'basics', stepId: 'missing' })).toThrow();
    for (const chapter of TUTORIAL_CHAPTERS)
      for (const step of chapter.steps)
        expect(resolveTutorialRequest({ chapterId: chapter.id, stepId: step.id })).toEqual({ chapterId: chapter.id, stepId: step.id });
  });
});

it('restricts tutorial renderers to the host lifecycle and rejects those channels from normal renderers', () => {
  const remove = registerTutorialContents(42);
  try {
    expect(() => assertTutorialChannel(42, 'git:createCommit')).toThrow();
    expect(() => assertTutorialChannel(42, TUTORIAL_CHANNELS.progress)).toThrow();
    expect(() => assertTutorialChannel(42, TUTORIAL_CHANNELS.complete)).not.toThrow();
    expect(() => assertTutorialChannel(7, TUTORIAL_CHANNELS.complete)).toThrow();
    expect(() => assertTutorialChannel(7, 'git:createCommit')).not.toThrow();
  } finally {
    remove();
  }
  expect(() => assertTutorialChannel(42, 'git:createCommit')).not.toThrow();
});
