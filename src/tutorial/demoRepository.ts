/* eslint-disable complexity -- Small in-memory Git interpreter, restricted to tutorial data. */
import type { GitCommandName } from '@/shared/ipc/gitCommands';
import type { TutorialStep } from '@/shared/tutorial/types';
import type { GitStashEntryDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';

export const DEMO_REPO = '/tutorial/OGC-Lernprojekt';
export const DEMO_SECOND_REPO = '/tutorial/Notizbuch';
export const DEMO_URL = 'https://git.example.invalid/lernen/OGC-Lernprojekt.git';
export const DEMO_TIME = Date.UTC(2026, 9, 20, 10);
export const ok = <T>(data: T): IpcResult<T> => ({ success: true, data });
export const unavailable = () => ({
  success: false as const,
  error: 'Diese Aktion ist in der Übung nicht verfügbar. / This action is not available in this exercise.',
});
export const hashFor = (number: number) => number.toString(16).padStart(40, 'a');

export type DemoCommit = { hash: string; subject: string; date: string; parent: string };
export class DemoRepository {
  branch = 'main';
  branches = ['main', 'feature/begruessung'];
  tags = ['v1.0.0'];
  files: Record<string, string> = {};
  staged = new Set<string>();
  modified = new Set<string>();
  conflicted = false;
  commits: DemoCommit[] = [];
  stashes: GitStashEntryDto[] = [];
  revision = 0;
  activeRepo = DEMO_REPO;
  events = new Set<string>();
  private listeners = new Set<() => void>();
  private channelListeners = new Map<string, Set<(value: unknown) => void>>();

  reset(step: TutorialStep): void {
    this.branch = 'main';
    this.branches = ['main', 'feature/begruessung'];
    this.tags = ['v1.0.0'];
    this.files = {
      'README.md': '# OGC-Lernprojekt\n\nWillkommen in deinem Lernprojekt!\n',
      LICENSE:
        'MIT License\n\nCopyright (c) 2026 OGC-Lernprojekt\n\nBeispieldatei für die interaktive Einführung. / Sample file for the interactive introduction.\n',
      'src/app.ts': 'export const greeting = "Hallo Welt!";\n',
      'package.json': '{\n  "name": "ogc-lernprojekt",\n  "scripts": { "test": "vitest run" }\n}\n',
    };
    this.modified = new Set(step.scenario === 'clean' ? [] : ['README.md']);
    this.staged = new Set(step.scenario === 'staged' ? ['README.md'] : []);
    if (this.staged.size) this.modified.clear();
    this.conflicted = step.scenario === 'conflict';
    if (this.conflicted) this.files['README.md'] = '# OGC-Lernprojekt\n<<<<<<< HEAD\nHallo Welt!\n=======\nWillkommen im Team!\n>>>>>>> feature/begruessung\n';
    this.commits = ['feat: Begrüßung ergänzen', 'docs: Lernprojekt beschreiben', 'feat: App anlegen', 'chore: Projekt initialisieren'].map(
      (subject, index) => ({
        hash: hashFor(4 - index),
        subject,
        date: new Date(DEMO_TIME - index * 86400000).toISOString(),
        parent: index < 3 ? hashFor(3 - index) : '',
      }),
    );
    this.stashes = step.scenario === 'stash' ? [{ index: 0, name: 'stash@{0}', hash: hashFor(50), branch: 'main', subject: 'Übungsänderungen' }] : [];
    this.events.clear();
    this.activeRepo = DEMO_REPO;
    this.revision += 1;
    this.changed();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  subscribeChannel(channel: string, listener: (value: unknown) => void) {
    const listeners = this.channelListeners.get(channel) || new Set();
    listeners.add(listener);
    this.channelListeners.set(channel, listeners);
    return () => {
      listeners.delete(listener);
    };
  }
  emitChannel(channel: string, value: unknown) {
    this.channelListeners.get(channel)?.forEach((listener) => listener(value));
  }
  mark(event: string) {
    this.events.add(event);
    this.revision += 1;
    this.changed();
  }
  changed() {
    this.listeners.forEach((listener) => listener());
  }
  status() {
    if (this.conflicted) return 'UU README.md\n';
    return [...new Set([...this.staged, ...this.modified])]
      .map((file) => `${this.staged.has(file) ? 'M' : ' '}${this.modified.has(file) ? 'M' : ' '} ${file}\n`)
      .join('');
  }
  log() {
    return this.commits
      .map(
        (commit, index) =>
          [
            commit.hash,
            commit.hash.slice(0, 7),
            'Alex Beispiel',
            commit.date,
            commit.subject,
            commit.parent,
            index === 0 ? `HEAD -> ${this.branch}\x1dorigin/main` : index === 2 ? 'tag: v1.0.0' : '',
          ].join('\x1f') + '\x00',
      )
      .join('');
  }
  diff(file = 'README.md') {
    return `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1,3 +1,3 @@\n # OGC-Lernprojekt\n \n-Hallo Welt!\n+Willkommen in deinem Lernprojekt!\n`;
  }
  stage(paths: string[]) {
    const selected = paths.includes('.') || paths.includes('-A') || paths.includes('--all') ? [...this.modified] : paths;
    for (const file of selected) if (this.modified.delete(file)) this.staged.add(file);
    if (this.staged.size) this.mark('staged');
    this.emitChannel('tree', this.activeRepo);
    return ok('');
  }
  commit(title: string) {
    if (!title.trim()) return { success: false as const, error: 'Bitte einen Titel eingeben. / Please enter a title.' };
    if (!this.staged.size) return { success: false as const, error: 'Keine vorgemerkten Änderungen. / No staged changes.' };
    this.commits.unshift({
      hash: hashFor(this.commits.length + 1),
      subject: title.trim(),
      parent: this.commits[0].hash,
      date: new Date(DEMO_TIME + 86400000).toISOString(),
    });
    this.staged.clear();
    this.mark('committed');
    this.emitChannel('tree', this.activeRepo);
    return ok(this.commits[0].hash);
  }
  command(name: GitCommandName, ...args: string[]): IpcResult<string> {
    const last = args.at(-1) || '';
    switch (name) {
      case 'statusPorcelain':
        return ok(this.status());
      case 'status':
        return ok(`# branch.oid ${this.commits[0].hash}\n# branch.head ${this.branch}\n# branch.upstream origin/${this.branch}\n# branch.ab +0 -0\n`);
      case 'log':
      case 'forensicHistory':
        return ok(this.log());
      case 'protectedBranches':
        return ok('main\n');
      case 'branches':
        return ok(this.branches.join('\n'));
      case 'branch':
        if (args.includes('--show-current')) return ok(this.branch);
        if (!args.length || args.includes('-a') || args.includes('-r') || args.some((arg) => arg.startsWith('--format')))
          return ok(this.branches.map((branch) => `${branch === this.branch ? '*' : ' '} ${branch}`).join('\n') + '\n  remotes/origin/main\n');
        if (args.includes('-d') || args.includes('-D')) this.branches = this.branches.filter((branch) => branch !== last);
        else if (args.includes('-m')) this.branches = this.branches.map((branch) => (branch === args.at(-2) ? last : branch));
        else {
          const branch = args.find((arg) => !arg.startsWith('-'));
          if (branch && !this.branches.includes(branch)) {
            this.branches.push(branch);
            this.mark('branch-created');
          }
        }
        return ok('');
      case 'checkout': {
        const branch = args.includes('-b') ? args[args.indexOf('-b') + 1] : last;
        if (!branch || branch.startsWith('-')) return unavailable();
        if (!this.branches.includes(branch)) {
          this.branches.push(branch);
          this.mark('branch-created');
        }
        this.branch = branch;
        this.mark('branch-switched');
        return ok(`Switched to branch '${branch}'`);
      }
      case 'remote':
        return ok(args.includes('-v') ? `origin\t${DEMO_URL} (fetch)\norigin\t${DEMO_URL} (push)\n` : args[0] === 'get-url' ? DEMO_URL : 'origin\n');
      case 'config':
        return ok(args.some((arg) => arg.includes('email')) ? 'alex@example.invalid' : args.some((arg) => arg.includes('name')) ? 'Alex Beispiel' : 'origin');
      case 'tag':
        if (!args.length || args.includes('-l') || args.includes('--list')) return ok(this.tags.join('\n'));
        if (args.includes('-d')) this.tags = this.tags.filter((tag) => tag !== last);
        else {
          const tag = args.find((arg) => !arg.startsWith('-'));
          if (tag) this.tags.push(tag);
        }
        this.mark('tag-created');
        return ok('');
      case 'forEachRef':
        return ok('');
      case 'submoduleStatus':
        return ok(` ${hashFor(2)} packages/design (v1.0.0)\n`);
      case 'add':
        return this.stage(args.filter((arg) => arg !== '--'));
      case 'reset':
        for (const file of this.staged) this.modified.add(file);
        this.staged.clear();
        this.mark('unstaged');
        return ok('');
      case 'commit':
        return this.commit(args[args.indexOf('-m') + 1] || 'docs: Lernprojekt aktualisieren');
      case 'diff':
        return ok(args.includes('--name-status') ? 'M\tREADME.md\n' : args.includes('--numstat') ? '1\t1\tREADME.md\n' : this.diff());
      case 'commitDetails':
        return ok('M\x00README.md\x00');
      case 'show': {
        const commit = this.commits.find((entry) => entry.hash === last) || this.commits[0];
        if (args.includes('--format=%P')) return ok(commit.parent);
        if (args.includes('--format=%B'))
          return ok(`${commit.subject}\n\nEin vorbereiteter Stand des Lernprojekts. / A prepared snapshot of the learning project.\n`);
        return ok(
          args.includes('--format=%H')
            ? this.commits[0].hash
            : args.some((arg) => arg.includes(':'))
              ? this.files[last.split(':').slice(1).join(':')] || this.files['README.md']
              : this.diff(),
        );
      }
      case 'reflog':
        return ok([hashFor(99), hashFor(99).slice(0, 7), 'HEAD@{1}', 'commit: Verlorene Begrüßung', new Date(DEMO_TIME).toISOString()].join('\x1f') + '\x00');
      case 'stash':
        if (args[0] === 'list') return ok(this.stashes.map((stash) => `${stash.name}: On ${stash.branch}: ${stash.subject}`).join('\n'));
        if (['pop', 'apply', 'drop'].includes(args[0])) {
          if (args[0] !== 'drop') this.modified.add('README.md');
          if (args[0] !== 'apply') this.stashes.shift();
          this.mark('stash-restored');
        } else {
          this.stashes.unshift({
            index: 0,
            name: 'stash@{0}',
            hash: hashFor(50),
            branch: this.branch,
            subject: args[args.indexOf('-m') + 1] || 'Übungsänderungen',
          });
          this.modified.clear();
          this.staged.clear();
          this.mark('stashed');
        }
        return ok('');
      case 'fetch':
        this.mark('fetched');
        return ok('Already up to date.');
      case 'pull':
        this.mark('pulled');
        return ok('Already up to date.');
      case 'push':
        this.mark('pushed');
        return ok('Everything up-to-date.');
      case 'conflictTakeOurs':
      case 'conflictTakeTheirs':
      case 'conflictTakeDeleted':
      case 'conflictMarkResolved':
        this.conflicted = false;
        this.files['README.md'] = '# OGC-Lernprojekt\n\nWillkommen im Team!\n';
        this.modified.clear();
        this.staged.add('README.md');
        this.mark('conflict-resolved');
        return ok('');
      case 'merge':
      case 'mergeIntoBranch':
      case 'mergeContinue':
      case 'rebaseContinue':
      case 'cherryPickContinue':
        this.mark('merged');
        return ok('Merge completed.');
      case 'mergeAbort':
      case 'rebaseAbort':
      case 'cherryPickAbort':
        this.conflicted = false;
        this.mark('aborted');
        return ok('');
      default:
        return unavailable();
    }
  }
}
