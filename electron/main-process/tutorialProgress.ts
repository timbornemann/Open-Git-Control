import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeTextFileAtomically } from './atomicFile';
import { TUTORIAL_CHAPTERS } from '../../src/shared/tutorial/catalog';
import type { TutorialProgressDto } from '../../src/shared/tutorial/types';

const knownChapters = new Set(TUTORIAL_CHAPTERS.map((chapter) => chapter.id));
// Electron may create these before application JavaScript runs. App-owned
// files, Local Storage and even an old startup log still identify a used profile.
const runtimeEntries = /^(Cache|Code Cache|GPUCache|Dawn.*Cache|Crashpad|Crash Reports|Singleton.*|lockfile|\.org\.chromium\..*)$/i;

export class TutorialProgressStore {
  private readonly file: string;
  private state: TutorialProgressDto;

  constructor(private readonly directory: string) {
    this.file = path.join(directory, 'tutorial-progress-v1.json');
    this.state = { version: 1, welcomeSeen: true, completedChapters: [] };
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as TutorialProgressDto;
        if (raw.version !== 1 || typeof raw.welcomeSeen !== 'boolean' || !Array.isArray(raw.completedChapters)) return;
        this.state = { version: 1, welcomeSeen: raw.welcomeSeen, completedChapters: [...new Set(raw.completedChapters.filter((id) => knownChapters.has(id)))] };
        return;
      }
      const entries = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
      this.state.welcomeSeen = entries.some((entry) => !runtimeEntries.test(entry));
      this.save();
    } catch {
      // Unreadable/corrupt profiles must never be mistaken for fresh installs.
      this.state.welcomeSeen = true;
    }
  }

  snapshot(): TutorialProgressDto {
    return { ...this.state, completedChapters: [...this.state.completedChapters] };
  }

  acknowledge(): TutorialProgressDto {
    return this.update({ ...this.state, welcomeSeen: true });
  }

  complete(chapterId: string): TutorialProgressDto {
    if (!knownChapters.has(chapterId)) throw new Error('Unknown tutorial chapter.');
    return this.update({ ...this.state, completedChapters: [...new Set([...this.state.completedChapters, chapterId])] });
  }

  private update(next: TutorialProgressDto): TutorialProgressDto {
    const previous = this.state;
    this.state = next;
    try {
      this.save();
    } catch (error) {
      this.state = previous;
      throw error;
    }
    return this.snapshot();
  }

  private save(): void {
    fs.mkdirSync(this.directory, { recursive: true });
    writeTextFileAtomically(this.file, JSON.stringify(this.state, null, 2));
  }
}
