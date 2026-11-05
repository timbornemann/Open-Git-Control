/* eslint-disable complexity -- Small in-memory Git interpreter, restricted to tutorial data. */
import type { GitCommandName } from '@/shared/ipc/gitCommands';
import { tutorialText, type TutorialStep } from '@/shared/tutorial/types';
import type { GitStashEntryDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import {
  stageDemoFiles,
  discardDemoFiles,
  deleteDemoFiles,
  removeDemoIndexFiles,
  seedDemoVersions,
  writeDemoFile,
  ignoreDemoRule,
  refreshDemoFiles,
} from './demoFiles';
import { demoTextDiff } from './demoDiff';
import { seedDemoSubmodules, prepareDemoSubmodules, demoSubmoduleStatus, demoSubmoduleCommand, type DemoSubmodule } from './demoSubmodules';
import { HUNK_CONTENT } from './demoHunkExamples';
import { resolveTutorialFileContent } from './demoContent';
import { EDITOR_CONTENT } from './demoEditorExamples';
import { createDemoFileVersions } from './demoFileVersions';
import { demoFormatFiles } from './demoFormatExamples';
import { demoBlob, demoBlobText, getDemoBlob, type DemoFiles } from './demoBlob';
import { demoDiffCommand } from './demoDiffCommand';
import { toolScenarioText } from './demoToolExamples';
import { demoStructuredFiles } from './demoStructuredExamples';
import { demoMarkupFiles } from './demoMarkupExamples';
import { demoDirectorySet, demoDescendant } from './demoDirectories';
import { captureDemoProject, type ProjectState } from './demoProjectState';
export type { ProjectState } from './demoProjectState';
import { demoTreeFiles } from './demoTreeExamples';
import { demoSearchFiles } from './demoSearchExamples';
import { historyText } from './demoHistoryExamples';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { createDemoHistory } from './demoHistoryFixture';
import { demoHistoryCommand, demoHistoryLog } from './demoHistoryCommands';
import { resolveDemoCommit } from './demoHistory';
import { demoForensicHistory } from './demoForensic';
import { seedDemoBranchRefs, demoUpstreamStatus } from './demoBranchRefs';
import { demoBranchCommand, demoCheckout, demoCheckoutFiles } from './demoBranchCommands';
import { prepareDemoBranches } from './demoBranchFixture';
import { DEFAULT_CLEANUP_PROTECTION, cleanupPatternMatches } from '@/shared/git/branchCleanupProtection';
import { createDemoStash, demoStashCommand, type DemoStashSnapshot } from './demoStashState';
import { demoMerge, demoMergeIntoBranch } from './demoMerge';
import type { ParkedBranchChange } from '@/shared/ipc/branchChange';
import type { DemoMergeState } from './demoMergeState';
import type { DemoRebaseState } from './demoRebaseState';
import { demoRebaseCommand } from './demoRebaseCommands';
import { demoConflictCommand } from './demoConflictCommands';
import type { CommitMessageEditBackup } from '@/shared/ipc/commitMessageEdit';
import { DemoCommitSequence } from './demoCommitSequence';
import { seedDemoReflog, recordDemoHead, demoReflog, type DemoReflogEntry } from './demoReflog';
import { demoReset } from './demoReset';
import { replayDemoCommit } from './demoReplayCommit';
import { initialDemoTags, demoTagCommand, demoTagReferences, type DemoTag } from './demoTags';

export const DEMO_REPO = '/tutorial/OGC-Lernprojekt';
export const DEMO_SECOND_REPO = '/tutorial/Notizbuch';
export const DEMO_NEW_REPO = '/tutorial/Neues-Projekt';
export const DEMO_CLONE_REPO = '/tutorial/OGC-Kopie';
export const DEMO_URL = 'https://git.example.invalid/lernen/OGC-Lernprojekt.git';
export const DEMO_TIME = Date.UTC(2026, 9, 20, 10);
export const ok = <T>(data: T): IpcResult<T> => ({ success: true, data });
export const unavailable = () => ({
  success: false as const,
  error: 'Diese Aktion ist in der Übung nicht verfügbar. / This action is not available in this exercise.',
});
export const hashFor = practiceCommitHash;

export type DemoCommit = { hash: string; subject: string; date: string; parent: string; body?: string; author?: string; email?: string; files?: DemoFiles };
export class DemoRepository {
  branch = 'main';
  branches = ['main', 'feature/begruessung'];
  branchHeads = new Map<string, string>();
  remoteHeads = new Map<string, string>();
  branchUpstreams = new Map<string, string>();
  branchProtectionPatterns = [...DEFAULT_CLEANUP_PROTECTION];
  tags = ['v1.0.0'];
  tagRefs: Map<string, DemoTag> = initialDemoTags();
  files: DemoFiles = {};
  submodules = new Map<string, DemoSubmodule>();
  directories = new Set<string>();
  headFiles: DemoFiles = {};
  indexFiles: DemoFiles = {};
  fileVersions = createDemoFileVersions();
  staged = new Set<string>();
  modified = new Set<string>();
  untracked = new Set<string>();
  tracked = new Set<string>();
  conflicted = false;
  mergeState: DemoMergeState | null = null;
  rebaseState: DemoRebaseState | null = null;
  commits: DemoCommit[] = [];
  stashes: GitStashEntryDto[] = [];
  stashSnapshots = new Map<string, DemoStashSnapshot>();
  parkedChanges: ParkedBranchChange[] = [];
  messageEditBackups: CommitMessageEditBackup[] = [];
  reflog: DemoReflogEntry[] = [];
  readonly commitSequence = new DemoCommitSequence();
  revision = 0;
  contextVersion = 0;
  activeRepo = DEMO_REPO;
  events = new Set<string>();
  clipboard = '';
  lastOpenedPath = '';
  lastOpenedUrl = '';
  private projects = new Map<string, ProjectState>();
  private listeners = new Set<() => void>();
  private channelListeners = new Map<string, Set<(value: unknown) => void>>();

  reset(step: TutorialStep, language: 'de' | 'en' = 'de'): void {
    this.contextVersion++;
    this.activeRepo = DEMO_REPO;
    this.mergeState = null;
    this.rebaseState = null;
    this.stashes = [];
    this.stashSnapshots = new Map();
    this.parkedChanges = [];
    this.messageEditBackups = [];
    this.reflog = [];
    this.directories = new Set();
    this.fileVersions = createDemoFileVersions();
    this.branch = 'main';
    this.branches = ['main', 'feature/begruessung'];
    this.branchProtectionPatterns = [...DEFAULT_CLEANUP_PROTECTION];
    this.tags = ['v1.0.0'];
    this.tagRefs = initialDemoTags();
    this.files = {
      'README.md': '# OGC-Lernprojekt\n\nWillkommen in deinem Lernprojekt!\n',
      LICENSE:
        'MIT License\n\nCopyright (c) 2026 OGC-Lernprojekt\n\nBeispieldatei für die interaktive Einführung. / Sample file for the interactive introduction.\n',
      'src/app.ts': 'export const greeting = "Hallo Welt!";\n',
      'package.json': '{\n  "name": "ogc-lernprojekt",\n  "scripts": { "test": "vitest run" }\n}\n',
    };
    if (step.scenario === 'formats') Object.assign(this.files, demoFormatFiles(language));
    if (step.scenario === 'structured') Object.assign(this.files, demoStructuredFiles(language));
    if (step.scenario === 'markup') Object.assign(this.files, demoMarkupFiles(language));
    if (step.scenario === 'tree-files') Object.assign(this.files, demoTreeFiles(language));
    if (step.scenario === 'search-files') Object.assign(this.files, demoSearchFiles(language));
    if (step.scenario === 'history' || step.scenario === 'conflict') this.files['README.md'] = historyText('latest', language);
    seedDemoSubmodules(this, step.prepare?.submodules);
    const head = structuredClone(this.files);
    this.tracked = new Set(Object.keys(this.files));
    this.untracked = new Set<string>();
    this.modified = new Set(
      ['clean', 'formats', 'structured', 'markup', 'tree-files', 'search-files', 'history', 'conflict'].includes(step.scenario || '') ? [] : ['README.md'],
    );
    this.staged = new Set(step.scenario === 'staged' || step.scenario === 'committed' ? ['README.md'] : []);
    if (this.staged.size) this.modified.clear();
    if (step.scenario === 'mixed' || step.scenario === 'mixed-staged') {
      this.files['notes.txt'] = 'Eine neue Datei im Lernprojekt. / A new file in the learning project.\n';
      this.untracked.add('notes.txt');
      this.staged.add('src/app.ts');
      if (step.scenario === 'mixed-staged') {
        this.modified.delete('README.md');
        this.staged.add('README.md');
      }
    }
    if (step.scenario === 'scope') {
      this.files['package.json'] = demoBlobText(this.files['package.json'])!.replace('  "scripts"', '  "description": "Das Lernprojekt",\n  "scripts"');
      this.files['notes.txt'] = 'Ideen für den Einstieg. / Ideas for getting started.\n';
      this.files['docs/ideas.md'] = '# Ideen\n\nEine weitere neue Datei.\n';
      this.modified = new Set(['README.md', 'package.json']);
      this.staged = new Set(['src/app.ts']);
      this.untracked = new Set(['notes.txt', 'docs/ideas.md']);
    }
    const deferredStage = (step.prepare?.staged || []).filter((path) => this.files[path] === undefined);
    for (const path of step.prepare?.staged || []) {
      if (this.modified.delete(path) || this.untracked.delete(path)) this.staged.add(path);
    }
    for (const path of step.prepare?.unstaged || []) {
      if (this.staged.delete(path)) (this.tracked.has(path) ? this.modified : this.untracked).add(path);
    }
    this.conflicted = false;
    if (this.staged.has('README.md') || this.modified.has('README.md')) head['README.md'] = '# OGC-Lernprojekt\n\nHallo Welt!\n';
    if (this.staged.has('src/app.ts') || this.modified.has('src/app.ts')) head['src/app.ts'] = 'export const greeting = "Hallo";\n';
    if (step.scenario === 'hunks') {
      head['README.md'] = HUNK_CONTENT.head;
      this.files['README.md'] = HUNK_CONTENT.all;
    }
    if (step.scenario === 'editor') head['README.md'] = this.files['README.md'] = tutorialText(EDITOR_CONTENT.head, language);
    const toolText = toolScenarioText(step.scenario, language);
    if (toolText !== undefined) head['README.md'] = this.files['README.md'] = toolText;
    seedDemoVersions(this, head);
    this.commits = createDemoHistory(this.headFiles, DEMO_TIME, language);
    seedDemoBranchRefs(this, DEMO_REPO);
    prepareDemoBranches(
      this,
      step.prepare?.branches ||
        (step.scenario === 'conflict'
          ? {
              fixture: 'diverged-readme',
              heads: [
                { name: 'main', commit: 4 },
                { name: 'feature/begruessung', commit: 5 },
              ],
              current: 'main',
            }
          : undefined),
      language,
    );
    seedDemoReflog(this);
    prepareDemoSubmodules(this, step.prepare?.submodules);
    if (step.scenario === 'conflict') {
      demoMerge(this, ['feature/begruessung']);
      if (!this.conflicted) throw new Error('The practice conflict recipe must produce an actual unresolved merge.');
    }
    for (const edit of step.prepare?.indexEdits || []) this.indexFiles[edit.path] = demoBlob(resolveTutorialFileContent(edit.content, language), edit.encoding);
    if (step.prepare?.indexEdits) refreshDemoFiles(this);
    for (const edit of step.prepare?.edits || []) writeDemoFile(this, edit.path, demoBlob(resolveTutorialFileContent(edit.content, language), edit.encoding));
    if (step.prepare?.restored) discardDemoFiles(this, step.prepare.restored);
    // Checkpoints may restore tracked deletions; the user's untracked-delete
    // command keeps its separate safety check in deleteDemoFiles.
    for (const path of step.prepare?.deleted || []) delete this.files[path];
    if (step.prepare?.deleted) refreshDemoFiles(this);
    for (const pattern of step.prepare?.ignore || []) ignoreDemoRule(this, pattern);
    // Rules may create .gitignore after the original versions were seeded.
    // Existing staged files retain their earlier index version across edits.
    if (deferredStage.length) stageDemoFiles(this, deferredStage);
    if (step.scenario === 'stash') createDemoStash(this, 'Übungsänderungen / Practice changes', true);
    this.commitSequence.reset();
    this.directories = demoDirectorySet([...Object.keys(head), ...Object.keys(this.files)], step.prepare?.directories);
    for (const removed of step.prepare?.removedDirectories || [])
      for (const path of this.directories) if (demoDescendant(path, removed)) this.directories.delete(path);
    this.projects.clear();
    if (step.scenario === 'committed' && step.prepare?.commit) {
      const prepared = step.prepare.commit;
      this.commit(tutorialText(prepared.subject, language), {
        description: prepared.description ? tutorialText(prepared.description, language) : '',
        signoff: prepared.signoff,
      });
    }
    this.events.clear();
    this.activeRepo = DEMO_REPO;
    this.revision += 1;
    this.changed();
  }

  registerProject(path: string, files: DemoFiles, hasHistory: boolean) {
    this.projects.set(path, {
      branch: 'main',
      branches: ['main'],
      branchHeads: new Map(hasHistory ? [['main', hashFor(100)]] : []),
      remoteHeads: new Map(hasHistory && this.originFor(path) ? [['origin/main', hashFor(100)]] : []),
      branchUpstreams: new Map(hasHistory && this.originFor(path) ? [['main', 'origin/main']] : []),
      branchProtectionPatterns: [...DEFAULT_CLEANUP_PROTECTION],
      tags: [],
      tagRefs: new Map(),
      files: structuredClone(files),
      submodules: new Map(),
      headFiles: hasHistory ? structuredClone(files) : {},
      indexFiles: hasHistory ? structuredClone(files) : {},
      fileVersions: createDemoFileVersions(),
      directories: demoDirectorySet(Object.keys(files)),
      staged: new Set(),
      modified: new Set(),
      untracked: new Set(hasHistory ? [] : Object.keys(files)),
      tracked: new Set(hasHistory ? Object.keys(files) : []),
      conflicted: false,
      mergeState: null,
      rebaseState: null,
      commits: hasHistory
        ? [
            {
              hash: hashFor(100),
              subject: 'docs: Beispielprojekt angelegt',
              date: new Date(DEMO_TIME).toISOString(),
              parent: '',
              files: structuredClone(files),
            },
          ]
        : [],
      stashes: [],
      stashSnapshots: new Map(),
      parkedChanges: [],
      messageEditBackups: [],
      reflog: hasHistory ? [{ hash: hashFor(100), subject: 'commit: docs: Beispielprojekt angelegt', date: new Date(DEMO_TIME).toISOString() }] : [],
    });
  }
  hasProject(path: string) {
    return path === this.activeRepo || this.projects.has(path);
  }
  changeCount(path = this.activeRepo) {
    const project = path === this.activeRepo ? this : this.projects.get(path);
    return project ? new Set([...project.modified, ...project.staged, ...project.untracked]).size : 0;
  }
  originFor(path = this.activeRepo) {
    return path === DEMO_REPO ? DEMO_URL : path === DEMO_CLONE_REPO ? 'https://git.example.invalid/lernen/OGC-Kopie.git' : null;
  }
  selectProject(path: string) {
    if (path === this.activeRepo) return;
    const next = this.projects.get(path);
    if (!next) throw new Error('Unknown practice repository.');
    this.contextVersion++;
    this.projects.set(this.activeRepo, captureDemoProject(this));
    Object.assign(this, structuredClone(next));
    this.activeRepo = path;
    this.mark('repo-selected');
    if (path === DEMO_SECOND_REPO) this.mark('repo-second-selected');
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
    const conflicts = this.mergeState?.conflicts;
    if (this.conflicted && !conflicts) return 'UU README.md\n';
    return (
      [...(conflicts || [])].map(([file, conflict]) => `${conflict.code} ${file}\n`).join('') +
      [...new Set([...this.staged, ...this.modified])]
        .filter((file) => !conflicts?.has(file))
        .map(
          (file) =>
            `${this.staged.has(file) ? (this.indexFiles[file] === undefined ? 'D' : this.tracked.has(file) ? 'M' : 'A') : ' '}${this.modified.has(file) ? (this.files[file] === undefined ? 'D' : 'M') : ' '} ${file}\n`,
        )
        .join('') +
      [...this.untracked].map((file) => `?? ${file}\n`).join('')
    );
  }
  log(commits?: readonly DemoCommit[]) {
    return demoHistoryLog(this, commits);
  }
  diff(file = 'README.md', staged = false) {
    return demoTextDiff(file, getDemoBlob(staged ? this.headFiles : this.indexFiles, file), getDemoBlob(staged ? this.indexFiles : this.files, file));
  }
  fileAt(source: string, path: string, commitHash?: string) {
    const files = source === 'staged' ? this.indexFiles : source === 'commit' ? resolveDemoCommit(this, commitHash || 'HEAD')?.files || {} : this.files;
    return getDemoBlob(files, path);
  }
  diffCommand(args: readonly string[]) {
    return demoDiffCommand(this, args);
  }
  stage(paths: string[]) {
    return stageDemoFiles(this, paths);
  }
  commit(title: string, options: { description?: string; signoff?: boolean; amend?: boolean } = {}) {
    if (this.rebaseState?.phase === 'conflict') return { success: false as const, error: 'Resolve the practice rebase conflict, then use Rebase continue.' };
    if (!title.trim()) return { success: false as const, error: 'Bitte einen Titel eingeben. / Please enter a title.' };
    if (this.conflicted) return { success: false as const, error: 'Resolve the practice conflict before committing.' };
    const picked = this.mergeState?.operation === 'cherry-pick' ? resolveDemoCommit(this, this.mergeState.sourceHash) : undefined;
    const merge = this.mergeState && !this.mergeState.operation && this.mergeState.mode !== 'squash' ? this.mergeState : null;
    if (this.mergeState && options.amend) return { success: false as const, error: 'Finish the pending practice merge before amending.' };
    if (!this.staged.size && !options.amend && !merge) return { success: false as const, error: 'Keine vorgemerkten Änderungen. / No staged changes.' };
    if (options.amend && !this.commits.length) return { success: false as const, error: 'There is no practice commit to amend.' };
    const parent = merge ? merge.targetHash + ' ' + merge.sourceHash : options.amend ? this.commits[0].parent : this.commits[0]?.hash || '';
    const body = [options.description?.trim(), options.signoff ? 'Signed-off-by: Alex Beispiel <alex@example.invalid>' : ''].filter(Boolean).join('\n\n');
    return this.saveCommit(title, parent, body, picked || (options.amend ? this.commits[0] : undefined), picked ? 'commit (cherry-pick)' : undefined);
  }
  /** Automatic merge commits may have an unchanged tree and multiple parents. */
  saveCommit(title: string, parent: string, body = '', original?: Pick<DemoCommit, 'author' | 'email' | 'date'>, reflogAction?: string) {
    this.mergeState = null;
    this.conflicted = false;
    this.commits.unshift({
      hash: this.commitSequence.next(this.commits),
      subject: title.trim(),
      author: original?.author || 'Alex Beispiel',
      email: original?.email || 'alex@example.invalid',
      parent,
      body,
      date: original?.date || new Date(DEMO_TIME + 86400000).toISOString(),
      files: structuredClone(this.indexFiles),
    });
    if (this.branch) this.branchHeads.set(this.branch, this.commits[0].hash);
    this.headFiles = structuredClone(this.indexFiles);
    if (this.rebaseState?.phase === 'edit') this.rebaseState.expectedHead = this.commits[0].hash;
    this.tracked = new Set(Object.keys(this.headFiles));
    this.staged.clear();
    refreshDemoFiles(this);
    recordDemoHead(this, (reflogAction || (original ? 'commit (amend)' : parent.includes(' ') ? 'commit (merge)' : 'commit')) + ': ' + title.trim());
    this.mark('committed');
    this.emitChannel('tree', this.activeRepo);
    return ok(this.commits[0].hash);
  }
  command(name: GitCommandName, ...args: string[]): IpcResult<string> {
    switch (name) {
      case 'statusPorcelain':
        return ok(this.status());
      case 'status':
        return ok(`# branch.oid ${this.commits[0]?.hash || '(initial)'}\n# branch.head ${this.branch || '(detached)'}\n${demoUpstreamStatus(this)}`);
      case 'log':
        return ok(this.log());
      case 'forensicHistory':
        return demoForensicHistory(this, args);
      case 'protectedBranches':
        return ok(this.branches.filter((name) => this.branchProtectionPatterns.some((pattern) => cleanupPatternMatches(name, pattern))).join('\n'));
      case 'branches':
        return ok(this.branches.join('\n'));
      case 'branch':
        return demoBranchCommand(this, args);
      case 'checkout': {
        const separator = args.indexOf('--');
        if (separator > 1) return unavailable();
        if (separator === 1) return demoCheckoutFiles(this, args[0], args.slice(2));
        if (separator === 0) return discardDemoFiles(this, args.slice(1));
        return demoCheckout(this, args);
      }
      case 'remote':
        return ok(
          this.originFor()
            ? args.includes('-v')
              ? `origin\t${this.originFor()} (fetch)\norigin\t${this.originFor()} (push)\n`
              : args[0] === 'get-url'
                ? this.originFor()!
                : 'origin\n'
            : '',
        );
      case 'config':
        return ok(args.some((arg) => arg.includes('email')) ? 'alex@example.invalid' : args.some((arg) => arg.includes('name')) ? 'Alex Beispiel' : 'origin');
      case 'tag':
        return demoTagCommand(this, args);
      case 'forEachRef':
        return demoTagReferences(this, args);
      case 'submoduleStatus':
        return ok(demoSubmoduleStatus(this));
      case 'submoduleUpdateInitRecursive':
        return demoSubmoduleCommand(this, true);
      case 'submoduleSyncRecursive':
        return demoSubmoduleCommand(this, false);
      case 'add':
        return this.stage(args.filter((arg) => arg !== '--'));
      case 'reset':
        return demoReset(this, args);
      case 'clean':
        return args.includes('--') ? deleteDemoFiles(this, args.slice(args.indexOf('--') + 1)) : unavailable();
      case 'rm':
        if (!args.includes('--cached') || !args.includes('--')) return unavailable();
        return removeDemoIndexFiles(this, args.slice(args.indexOf('--') + 1));
      case 'commit':
        return this.commit(args[args.indexOf('-m') + 1] || 'docs: Lernprojekt aktualisieren');
      case 'diff':
        return ok(this.diffCommand(args));
      case 'commitDetails':
      case 'show':
        return demoHistoryCommand(this, name, args);
      case 'reflog':
        return demoReflog(this, args);
      case 'stash':
        return demoStashCommand(this, args);
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
      case 'mergeContinue':
      case 'mergeAbort':
      case 'cherryPickContinue':
      case 'cherryPickAbort':
        return demoConflictCommand(this, name, args);
      case 'merge':
        return demoMerge(this, args);
      case 'mergeIntoBranch':
        return demoMergeIntoBranch(this, args);
      case 'cherry-pick':
      case 'revert':
        return replayDemoCommit(this, name, args);
      case 'rebaseContinue':
      case 'rebaseAbort':
        return demoRebaseCommand(this, name, args);
      default:
        return unavailable();
    }
  }
}
