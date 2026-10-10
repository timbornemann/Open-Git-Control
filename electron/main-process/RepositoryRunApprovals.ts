import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow, dialog, type WebContents } from 'electron';
import {
  getRepositoryRunPlatform,
  getRunPlatformCommand,
  type RepositoryRunActionId,
  type RepositoryRunConfigDto,
  type RepositoryRunPlatform,
  type RepositoryRunShell,
} from '../../src/types/repositoryRun';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { writeTextFileAtomically } from './atomicFile';
import { readSettings } from './settingsStore';

const MAX_APPROVALS_PER_REPOSITORY = 64;
const MAX_APPROVED_REPOSITORIES = 1_000;
const MAX_DISPLAYED_COMMAND_LENGTH = 1_000;

export type RepositoryRunActionDescription = {
  action: RepositoryRunActionId;
  fingerprint: string;
  steps: Array<{ label: string; shell: RepositoryRunShell | null; command: string }>;
};

export type RepositoryRunApprovalPrompt = {
  sender: WebContents | null;
  repoPath: string;
  description: RepositoryRunActionDescription;
};

type ApprovalFile = { version: 1; repositories: Record<string, string[]> };

/** Describes exactly what an action executes on this platform; labels are display-only. */
export function describeRepositoryRunAction(
  config: RepositoryRunConfigDto,
  action: RepositoryRunActionId,
  platform: RepositoryRunPlatform = getRepositoryRunPlatform(process.platform),
): RepositoryRunActionDescription {
  const steps = config.actions[action].steps.map((step) => {
    const command = getRunPlatformCommand(step, platform);
    return { label: step.label, shell: command?.shell ?? null, command: command?.command ?? '' };
  });
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([action, platform, steps.map((step) => [step.shell, step.command])]))
    .digest('hex');
  return { action, fingerprint, steps };
}

/** Keeps padding or line breaks from pushing part of a command out of view. */
export function formatCommandForApproval(command: string): string {
  const visible = command
    .replace(/\r\n?|\n/g, ' ⏎ ')
    // eslint-disable-next-line no-control-regex -- Control characters must not be rendered invisibly.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, '\ufffd')
    .replace(/\s{8,}/g, (run) => ` ⟨${run.length} whitespace⟩ `);
  if (visible.length <= MAX_DISPLAYED_COMMAND_LENGTH) return visible;
  return `${visible.slice(0, MAX_DISPLAYED_COMMAND_LENGTH)} … (+${visible.length - MAX_DISPLAYED_COMMAND_LENGTH} characters not shown)`;
}

export async function showNativeRunApprovalDialog({ sender, repoPath, description }: RepositoryRunApprovalPrompt): Promise<boolean> {
  const german = readSettings().language === 'de';
  const steps = description.steps
    .map((step, index) => `${index + 1}. ${step.label} [${step.shell ?? '?'}]\n   ${formatCommandForApproval(step.command)}`)
    .join('\n\n');
  const detail = german
    ? `${repoPath}\n.Open-Git-Control/run.json – Aktion „${description.action}“\n\n${steps}\n\nDiese Befehle stammen aus dem Repository und laufen mit deinen Benutzerrechten. Führe sie nur aus, wenn du dem Repository vertraust. Die Freigabe gilt, bis sich die Befehle ändern.`
    : `${repoPath}\n.Open-Git-Control/run.json – action "${description.action}"\n\n${steps}\n\nThese commands come from the repository and run with your user permissions. Only run them if you trust this repository. The approval stays valid until the commands change.`;
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Open-Git-Control',
    message: german ? 'Befehle aus diesem Repository ausführen?' : 'Run commands from this repository?',
    detail,
    buttons: german ? ['Ausführen', 'Abbrechen'] : ['Run', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const window = sender && !sender.isDestroyed() ? BrowserWindow.fromWebContents(sender) : null;
  const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return result.response === 0;
}

/**
 * Run configurations are committed repository files, so a clone or a pull
 * can change what the Run buttons execute. Commands only run after the user
 * approved this exact command list for this repository in a main-process
 * dialog that the renderer cannot answer.
 */
export class RepositoryRunApprovals {
  private pending = false;

  constructor(
    private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'run-approvals.json'),
    private readonly confirm: (prompt: RepositoryRunApprovalPrompt) => Promise<boolean> = showNativeRunApprovalDialog,
  ) {}

  private read(): ApprovalFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as ApprovalFile;
      if (parsed?.version !== 1 || !parsed.repositories || typeof parsed.repositories !== 'object') throw new Error('Unsupported approvals.');
      const repositories: Record<string, string[]> = {};
      for (const [key, fingerprints] of Object.entries(parsed.repositories)) {
        if (Array.isArray(fingerprints)) repositories[key] = fingerprints.filter((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
      }
      return { version: 1, repositories };
    } catch {
      // A missing or damaged file only means that every command must be approved again.
      return { version: 1, repositories: {} };
    }
  }

  isApproved(repoPath: string, fingerprint: string): boolean {
    return this.read().repositories[repositoryPathKey(repoPath)]?.includes(fingerprint) === true;
  }

  approve(repoPath: string, fingerprint: string): void {
    const data = this.read();
    const key = repositoryPathKey(repoPath);
    const existing = (data.repositories[key] ?? []).filter((value) => value !== fingerprint);
    delete data.repositories[key];
    data.repositories[key] = [...existing, fingerprint].slice(-MAX_APPROVALS_PER_REPOSITORY);
    const keys = Object.keys(data.repositories);
    for (const staleKey of keys.slice(0, Math.max(0, keys.length - MAX_APPROVED_REPOSITORIES))) delete data.repositories[staleKey];
    writeTextFileAtomically(this.filePath(), JSON.stringify(data));
  }

  async authorize(sender: WebContents | null, repoPath: string, config: RepositoryRunConfigDto, action: RepositoryRunActionId): Promise<void> {
    const description = describeRepositoryRunAction(config, action);
    if (this.isApproved(repoPath, description.fingerprint)) return;
    if (this.pending) throw new Error('Another run approval is already open.');
    this.pending = true;
    try {
      if (!(await this.confirm({ sender, repoPath, description }))) {
        throw new Error('Run cancelled: the repository commands were not approved.');
      }
      this.approve(repoPath, description.fingerprint);
    } finally {
      this.pending = false;
    }
  }
}
