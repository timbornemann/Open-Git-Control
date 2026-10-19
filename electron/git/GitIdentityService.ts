import { createHash } from 'crypto';
import { homedir } from 'os';
import type { GitRunner } from './GitRunner';
import type { GitProcessResult } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';
import {
  validGitIdentityName,
  validGitIdentityEmail,
  type GitIdentityRequest,
  type GitIdentityStatus,
  type SaveGitIdentityRequest,
} from '../../src/shared/ipc/gitIdentity';
import { identityKeys, identityConfigValues, writeIdentityConfig } from './GitIdentityConfig';

const parseIdentity = (text: string) => {
  const match = text.trim().match(/^(.*?) <([^<>]*)> \d+ [+-]\d{4}$/);
  return match ? { name: match[1], email: match[2] } : null;
};

/** Reads Git's effective identity, without guessing it from the OS or a hosting login. */
export class GitIdentityService {
  private saving = false;
  constructor(private readonly git: Pick<GitRunner, 'runResult' | 'withExclusiveWrite'>) {}

  private async config(repoPath: string, global: boolean, run: (cwd: string, args: string[]) => Promise<GitProcessResult>) {
    const result = await run(repoPath, ['config', ...(global ? ['--global'] : []), '--includes', '--null', '--get-regexp', identityKeys]);
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(redactGitSensitiveText(result.stderr || 'Git configuration could not be read.'));
    return result.stdout;
  }

  async read(request: GitIdentityRequest, run = this.git.runResult.bind(this.git)): Promise<GitIdentityStatus> {
    if (
      !request ||
      !['repository', 'global'].includes(request.scope) ||
      (request.repoPath !== null && typeof request.repoPath !== 'string') ||
      (request.scope === 'repository' && !request.repoPath)
    )
      throw new Error('Choose a repository or the global Git configuration.');
    const { repoPath, scope } = request;
    const cwd = repoPath || homedir();
    const global = await this.config(cwd, true, run);
    let config = global,
      directory = 'global';
    let authorIdentity: ReturnType<typeof parseIdentity> = null,
      committerIdentity: ReturnType<typeof parseIdentity> = null;
    if (scope === 'repository') {
      const [effective, author, committer, gitDirectory] = await Promise.all([
        this.config(cwd, false, run),
        run(cwd, ['-c', 'user.useConfigOnly=true', 'var', 'GIT_AUTHOR_IDENT']),
        run(cwd, ['-c', 'user.useConfigOnly=true', 'var', 'GIT_COMMITTER_IDENT']),
        run(cwd, ['rev-parse', '--absolute-git-dir']),
      ]);
      if (gitDirectory.exitCode !== 0) throw new Error('The selected path is not a usable Git repository.');
      config = effective;
      directory = gitDirectory.stdout.trim();
      authorIdentity = author.exitCode === 0 ? parseIdentity(author.stdout) : null;
      committerIdentity = committer.exitCode === 0 ? parseIdentity(committer.stdout) : null;
    }
    const values = identityConfigValues(config);
    const name = committerIdentity?.name || values.get('user.name') || values.get('committer.name') || values.get('author.name') || '';
    const email = committerIdentity?.email || values.get('user.email') || values.get('committer.email') || values.get('author.email') || '';
    const missing: GitIdentityStatus['missing'] = [];
    if (!validGitIdentityName(name)) missing.push('name');
    if (!validGitIdentityEmail(email)) missing.push('email');
    const ready =
      scope === 'global'
        ? missing.length === 0
        : Boolean(
            authorIdentity &&
            committerIdentity &&
            [authorIdentity, committerIdentity].every((identity) => validGitIdentityName(identity.name) && validGitIdentityEmail(identity.email)),
          );
    const revision = createHash('sha256')
      .update(JSON.stringify([directory, scope, config, global, authorIdentity, committerIdentity]))
      .digest('hex');
    return { repoPath, scope, name, email, missing, ready, revision };
  }

  async save(request: SaveGitIdentityRequest, current: () => void): Promise<GitIdentityStatus> {
    if (
      !request ||
      !['repository', 'global'].includes(request.scope) ||
      typeof request.name !== 'string' ||
      typeof request.email !== 'string' ||
      !validGitIdentityName(request.name) ||
      !validGitIdentityEmail(request.email) ||
      !/^[a-f\d]{64}$/.test(request.expectedRevision) ||
      (request.scope === 'repository' && !request.repoPath)
    )
      throw new Error('Enter a valid Git name and email and choose repository or global configuration.');
    if (this.saving) throw new Error('Git identity configuration is already being saved.');
    this.saving = true;
    const cwd = request.repoPath || homedir();
    try {
      return await this.git.withExclusiveWrite(cwd, 'git-identity-save', async (git) => {
        // Use the writer's process facade; scheduled reads would block its own write lane.
        const run = async (cwd: string, args: string[]): Promise<GitProcessResult> => {
          try {
            return { stdout: await git.run(cwd, args), stderr: '', exitCode: 0 };
          } catch (error) {
            git.signal?.throwIfAborted();
            const message = error instanceof Error ? error.message : String(error);
            return { stdout: '', stderr: message, exitCode: message === 'Git exited with code 1.' ? 1 : 128 };
          }
        };
        current();
        const before = await this.read(request, run);
        current();
        if (before.revision !== request.expectedRevision) throw new Error('Git identity configuration changed. Reload the current values before saving.');
        const desired = { name: request.name.trim(), email: request.email.trim() };
        const values = identityConfigValues(await this.config(cwd, request.scope === 'global', run));
        const entries: [string, string][] = [
          ['user.name', desired.name],
          ['user.email', desired.email],
        ];
        for (const field of ['name', 'email'] as const) {
          if (desired[field] === before[field]) continue;
          // A single identity edit must also update an existing role override
          // for that field, while retaining deliberately different other fields.
          for (const role of ['author', 'committer']) if (values.has(`${role}.${field}`)) entries.push([`${role}.${field}`, desired[field]]);
        }
        await writeIdentityConfig(git, cwd, request.scope, entries, current);
        current();
        const result = await this.read(request, run);
        current();
        const author = request.scope === 'repository' ? parseIdentity(await git.run(cwd, ['-c', 'user.useConfigOnly=true', 'var', 'GIT_AUTHOR_IDENT'])) : null;
        if (
          !result.ready ||
          result.name !== desired.name ||
          result.email !== desired.email ||
          (author && (['name', 'email'] as const).some((field) => desired[field] !== before[field] && author[field] !== desired[field]))
        )
          throw new Error(
            'Git still uses different identity values. An environment or command-line override takes precedence; check GIT_AUTHOR_EMAIL, GIT_COMMITTER_EMAIL and Git configuration.',
          );
        current();
        return result;
      });
    } finally {
      this.saving = false;
    }
  }
}
