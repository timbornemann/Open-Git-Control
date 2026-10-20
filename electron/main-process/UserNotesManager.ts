import { app, BrowserWindow } from 'electron';
import { isUserNoteId, USER_NOTES_CHECK_INTERVAL_MS, type UserNoteDto, type UserNoteIdentity, type UserNotesStatusDto } from '../../src/shared/userNotes';
import { IpcChannel } from '../../src/types/ipcContract';
import { emptyUserNotesSnapshot } from './userNotesModel';
import { fetchUserNotesSnapshot } from './userNotesRemote';
import { UserNotesStore } from './userNotesStore';

type ActionResult = { success: boolean; error?: string };
type Dependencies = {
  root?: string;
  synchronize?: typeof fetchUserNotesSnapshot;
  emit?: (status: UserNotesStatusDto) => void;
};

export class UserNotesManager {
  private snapshot = emptyUserNotesSnapshot();
  private acknowledgements: Record<string, string> = {};
  private state: UserNotesStatusDto['state'] = 'idle';
  private error: string | null = null;
  private enabled = false;
  private stopped = false;
  private interval: NodeJS.Timeout | null = null;
  private controller: AbortController | null = null;
  private running: Promise<ActionResult> | null = null;
  private mutations: Promise<unknown> = Promise.resolve();
  private readonly store: UserNotesStore;
  private readonly ready: Promise<void>;
  private readonly synchronize: typeof fetchUserNotesSnapshot;
  private readonly emit: (status: UserNotesStatusDto) => void;

  constructor(dependencies: Dependencies = {}) {
    this.store = new UserNotesStore(dependencies.root || app.getPath('userData'));
    this.synchronize = dependencies.synchronize || fetchUserNotesSnapshot;
    this.emit =
      dependencies.emit ||
      ((status) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IpcChannel.UserNotesChanged, status);
      });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const results = await Promise.allSettled([this.store.loadSnapshot(), this.store.loadAcknowledgements()]);
    if (results[0].status === 'fulfilled' && results[0].value) {
      this.snapshot = results[0].value;
      this.state = 'ready';
    }
    if (results[1].status === 'fulfilled') this.acknowledgements = results[1].value;
    for (const result of results) {
      if (result.status === 'rejected') {
        this.state = 'error';
        this.error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }
  }

  private status(): UserNotesStatusDto {
    return {
      state: this.state,
      lastCheckedAt: this.snapshot.checkedAt || null,
      error: this.error,
      notes: this.snapshot.notes.map(({ id, title, revision }) => ({ id, title, revision, acknowledged: this.acknowledgements[id] === revision })),
    };
  }

  async getStatus(): Promise<UserNotesStatusDto> {
    await this.ready;
    return this.status();
  }

  async getNote(identity: UserNoteIdentity): Promise<UserNoteDto> {
    await this.ready;
    if (!identity || !isUserNoteId(identity.id) || typeof identity.revision !== 'string') throw new Error('Invalid user note identity.');
    const note = this.snapshot.notes.find((item) => item.id === identity.id && item.revision === identity.revision);
    if (!note) throw new Error('This user note is no longer available. Reopen the notes to see the latest version.');
    const images: Record<string, string> = Object.create(null);
    for (const [reference, image] of Object.entries(note.images)) {
      if (image.sha && this.snapshot.assets[image.sha]) images[reference] = this.snapshot.assets[image.sha];
    }
    return { id: note.id, revision: note.revision, markdown: note.markdown, images };
  }

  setChecksEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (!enabled) this.controller?.abort();
    void this.ready.then(() => {
      if (!this.enabled || this.stopped || this.interval) return;
      this.interval = setInterval(() => void this.check(true), USER_NOTES_CHECK_INTERVAL_MS);
      this.interval.unref();
      void this.check(true);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation);
    this.mutations = next.catch(() => undefined);
    return next;
  }

  async acknowledge(identities: UserNoteIdentity[]): Promise<ActionResult> {
    await this.ready;
    if (
      !Array.isArray(identities) ||
      identities.length > 5000 ||
      identities.some((entry) => !entry || !isUserNoteId(entry.id) || typeof entry.revision !== 'string' || !/^[a-f0-9]{64}$/.test(entry.revision))
    )
      return { success: false, error: 'Invalid user notes acknowledgements.' };
    return this.enqueue(async () => {
      try {
        const next = { ...this.acknowledgements };
        for (const { id, revision } of identities) {
          if (this.snapshot.notes.some((note) => note.id === id && note.revision === revision)) next[id] = revision;
        }
        await this.store.saveAcknowledgements(next);
        this.acknowledgements = next;
        this.emit(this.status());
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  async check(automatic = false): Promise<ActionResult> {
    await this.ready;
    if (this.stopped || (automatic && !this.enabled)) return { success: false, error: 'Automatic user notes checks are disabled.' };
    if (this.running) {
      if (!this.controller?.signal.aborted) return this.running;
      await this.running;
      return this.check(automatic);
    }
    const controller = new AbortController();
    this.controller = controller;
    this.state = 'checking';
    this.error = null;
    this.emit(this.status());
    this.running = this.run(controller).finally(() => {
      this.running = null;
      if (this.controller === controller) this.controller = null;
    });
    return this.running;
  }

  private async run(controller: AbortController): Promise<ActionResult> {
    const timeout = setTimeout(() => controller.abort(new Error('User notes check timed out.')), 2 * 60 * 1000);
    timeout.unref();
    try {
      const next = await this.synchronize(this.snapshot, controller.signal);
      controller.signal.throwIfAborted();
      await this.enqueue(async () => {
        controller.signal.throwIfAborted();
        await this.store.saveSnapshot(next, () => !controller.signal.aborted && !this.stopped);
        this.snapshot = next;
        const retained = Object.fromEntries(Object.entries(this.acknowledgements).filter(([id]) => next.notes.some((note) => note.id === id)));
        if (Object.keys(retained).length !== Object.keys(this.acknowledgements).length) {
          await this.store.saveAcknowledgements(retained);
          this.acknowledgements = retained;
        }
      });
      this.state = 'ready';
      return { success: true };
    } catch (error) {
      const cancelled = controller.signal.aborted && !controller.signal.reason?.message?.includes('timed out');
      this.state = cancelled ? (this.snapshot.checkedAt ? 'ready' : 'idle') : 'error';
      this.error = cancelled ? null : error instanceof Error ? error.message : String(error);
      return { success: false, error: this.error || 'User notes check cancelled.' };
    } finally {
      clearTimeout(timeout);
      if (!this.stopped) this.emit(this.status());
    }
  }

  async dispose(): Promise<void> {
    this.stopped = true;
    this.enabled = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.controller?.abort();
    await this.running;
    await this.mutations;
  }
}
