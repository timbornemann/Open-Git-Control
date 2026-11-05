import type { AppSettingsDto } from '../../types/appDtos';
import type { TextFileEncodingDto } from '../ipc/contracts/git';

export type TutorialText = readonly [de: string, en: string];
export type TutorialEditorSelection = { selector: string; from: number; to: number };
export type HunkExample = 'head' | 'greeting' | 'first-two' | 'first' | 'last' | 'all';
export type EditorExample = 'head' | 'edited' | 'draft' | 'index' | 'work' | 'index-edited';
export type ToolExample =
  | 'encoding'
  | 'encoding-crlf'
  | 'lines'
  | 'trimmed'
  | 'nonempty'
  | 'unique'
  | 'sorted'
  | 'upper'
  | 'lower'
  | 'affix-base'
  | 'affixed'
  | 'compacted'
  | 'codec-base'
  | 'codec-base64'
  | 'codec-url'
  | 'invalid-base64'
  | 'invalid-url'
  | 'selection-base'
  | 'selection-base64'
  | 'selection-url'
  | HashContentVersion;
export type HashContentVersion = 'hash-base' | 'hash-edited';
export type HashExample = 'base' | 'edited' | 'bom';
export type HashAlgorithm = 'sha256' | 'sha1' | 'md5' | 'all';
export type StructuredExample =
  'base' | 'formatted' | 'sorted' | 'json-invalid' | 'schema-contract' | 'schema-failure' | 'schema-invalid' | 'yaml-base' | 'yaml-formatted' | 'yaml-invalid';
export type MarkupExample = 'html-source' | 'html-formatted' | 'html-minified' | 'html-invalid' | 'xml-source' | 'xml-formatted' | 'xml-invalid';
export type TreeExample = 'note' | 'other' | 'keep' | 'created';
export type SearchExample = 'guide' | 'guide-one' | 'guide-all' | 'notes' | 'notes-all' | 'code' | 'code-all' | 'draft';
export type HistoryExample = 'initial' | 'app' | 'description' | 'latest' | 'work' | 'index';
export type MergeConflictExample = 'base' | 'current' | 'incoming' | 'first-incoming' | 'mixed' | 'license-current';
export type FormatExample =
  'markdown' | 'markdown-edited' | 'html' | 'html-edited' | 'stylesheet' | 'csv' | 'csv-quoted' | 'csv-row' | 'csv-column' | 'csv-removed';
export type TutorialFileContent =
  | TutorialText
  | { example: 'readme-hunks'; version: HunkExample }
  | { example: 'editor-readme'; version: EditorExample }
  | { example: 'editor-tools'; version: ToolExample }
  | { example: 'file-formats'; version: FormatExample }
  | { example: 'file-hash'; version: HashExample; algorithm: HashAlgorithm }
  | { example: 'markup-files'; version: MarkupExample }
  | { example: 'tree-files'; version: TreeExample }
  | { example: 'search-files'; version: SearchExample }
  | { example: 'history-readme'; version: HistoryExample }
  | { example: 'merge-conflicts'; version: MergeConflictExample }
  | { example: 'structured-files'; version: StructuredExample };
export type TutorialArea = 'repo' | 'localRepos' | 'planner' | 'hosting' | 'analytics' | 'settings';
export type TutorialCompletion =
  | { kind: 'all'; conditions: readonly TutorialCompletion[] }
  | { kind: 'any'; conditions: readonly TutorialCompletion[] }
  | { kind: 'value'; selector: string; value: TutorialFileContent; comparison?: 'json' }
  | { kind: 'text'; selector: string; value: TutorialFileContent }
  | { kind: 'clipboard'; value: TutorialFileContent }
  | { kind: 'element'; selector: string }
  | { kind: 'absent'; selector: string }
  | ({ kind: 'selection' } & TutorialEditorSelection)
  | { kind: 'feedback'; trigger: string; message: TutorialText; error: boolean }
  | { kind: 'file-format'; path: string; source: 'worktree' | 'index' | 'head'; encoding: TextFileEncodingDto; lineEnding?: 'lf' | 'crlf' }
  | {
      kind: 'working-tree';
      repoPath?: string;
      staged?: readonly string[];
      unstaged?: readonly string[];
      untracked?: readonly string[];
      absent?: readonly string[];
      content?: readonly { path: string; source: 'worktree' | 'index' | 'head'; value: TutorialFileContent }[];
    };
export type TutorialCommitSetup = { subject: TutorialText; description?: TutorialText; signoff?: boolean };
export type TutorialPreparationAction =
  | { click: string }
  | { pressKey: { selector: string; key: 'Enter' | 'Escape' } }
  | { contextMenu: string }
  | { expand: string }
  | { collapse: string }
  | { fill: { selector: string; value: TutorialFileContent } }
  | { waitFor: string }
  | { waitValue: { selector: string; value: TutorialFileContent } };
export type TutorialRepositoriesSetup = {
  entries?: 'one' | 'both';
  pinned?: boolean;
  directory?: 'existing' | 'empty';
  active?: 'main' | 'second' | 'new' | 'clone';
  initialized?: boolean;
  cloned?: boolean;
  iconMode?: 'auto' | 'manual' | 'initials';
};
export type TutorialStep = {
  id: string;
  title: TutorialText;
  description: TutorialText;
  target: string;
  gesture?: 'contextmenu' | 'enter' | 'space' | 'escape';
  area: TutorialArea;
  inspector?: 'staging' | 'files' | 'history';
  settingsTab?: 'general' | 'shortcuts' | 'integrations' | 'api' | 'security' | 'system' | 'help';
  scenario?:
    | 'staged'
    | 'clean'
    | 'conflict'
    | 'stash'
    | 'mixed'
    | 'mixed-staged'
    | 'committed'
    | 'scope'
    | 'hunks'
    | 'editor'
    | 'formats'
    | 'encoding'
    | 'text-tools'
    | 'affixes'
    | 'codecs'
    | 'selection-codecs'
    | 'hashes'
    | 'structured'
    | 'markup'
    | 'tree-files'
    | 'search-files'
    | 'history';
  /** Normal forward navigation keeps the actual exercise; jumps restore its recipe. */
  continue?: boolean;
  prepare?: {
    submodules?: 'uninitialized' | 'ready' | 'different-commit' | 'changed-url';
    commit?: TutorialCommitSetup;
    repositories?: TutorialRepositoriesSetup;
    branches?: {
      fixture?: 'diverged-license' | 'diverged-readme' | 'diverged-conflicts' | 'linear-independent';
      heads: readonly { name: string; commit: number }[];
      current: string;
      remotes?: readonly { name: string; commit: number }[];
      protectedPatterns?: readonly string[];
    };
    staged?: readonly string[];
    unstaged?: readonly string[];
    edits?: readonly { path: string; content: TutorialFileContent; encoding?: TextFileEncodingDto }[];
    indexEdits?: readonly { path: string; content: TutorialFileContent; encoding?: TextFileEncodingDto }[];
    diff?: { source: 'staged' | 'unstaged'; path: string };
    restored?: readonly string[];
    deleted?: readonly string[];
    directories?: readonly string[];
    removedDirectories?: readonly string[];
    ignore?: readonly string[];
    contextMenu?: string;
    click?: readonly string[];
    fill?: readonly { selector: string; value: TutorialFileContent }[];
    selection?: TutorialEditorSelection;
    submit?: string;
    after?: readonly string[];
    actions?: readonly TutorialPreparationAction[];
    ready?: string;
  };
  completion?: TutorialCompletion;
  action?: string;
  openView?: 'recovery' | 'files' | 'runConfig' | 'remoteConfig' | 'secretScanAllowlist' | 'repositoryPublication' | 'diff';
};
export type TutorialChapter = {
  id: string;
  section?: TutorialArea | 'overview';
  title: TutorialText;
  description: TutorialText;
  question: TutorialText;
  keywords: string;
  steps: readonly TutorialStep[];
};
export type TutorialLaunchRequest = { chapterId: string; stepId?: string };
export type TutorialProgressDto = { version: 1; welcomeSeen: boolean; completedChapters: string[] };
export type TutorialLaunchContext = {
  request: TutorialLaunchRequest;
  language: AppSettingsDto['language'];
  theme: AppSettingsDto['theme'];
  progress: TutorialProgressDto;
};
export interface TutorialControlApi {
  getTutorialProgress: () => Promise<TutorialProgressDto>;
  acknowledgeTutorialWelcome: () => Promise<TutorialProgressDto>;
  startTutorial: (request: TutorialLaunchRequest) => Promise<{ success: boolean; error?: string }>;
  onTutorialClosed: (callback: (failed: boolean) => void) => () => void;
}
/** The tutorial preload deliberately exposes no repository or credential API. */
export interface TutorialHostApi {
  getContext: () => Promise<TutorialLaunchContext>;
  completeChapter: (chapterId: string) => Promise<TutorialProgressDto>;
  close: (failed?: boolean) => Promise<void>;
  ready: () => Promise<void>;
}

export const tutorialText = (value: TutorialText, language: 'de' | 'en') => value[language === 'de' ? 0 : 1];

export const TUTORIAL_CHANNELS = {
  progress: 'tutorial:progress',
  acknowledge: 'tutorial:acknowledge',
  start: 'tutorial:start',
  context: 'tutorial:context',
  complete: 'tutorial:complete',
  close: 'tutorial:close',
  ready: 'tutorial:ready',
} as const;
