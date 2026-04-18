import { execFile } from 'child_process';
import { promisify } from 'util';

const GITHUB_CLI_INSTALL_URL = 'https://cli.github.com/';
const GITHUB_CLI_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const GITHUB_CLI_TOKEN_TIMEOUT_MS = 30 * 1000;
const DEFAULT_GITHUB_HOST = 'github.com';
const execFileAsync = promisify(execFile);

type ExecErrorLike = Error & {
  stderr?: string;
  stdout?: string;
  code?: string | number;
};

function formatExecError(error: unknown): string {
  if (typeof error === 'string') {
    return error.trim();
  }

  if (!(error instanceof Error)) {
    return 'Unknown command error.';
  }

  const execError = error as ExecErrorLike;
  const stderr = typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
  const stdout = typeof execError.stdout === 'string' ? execError.stdout.trim() : '';
  return stderr || stdout || error.message;
}

async function runGhCommand(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('gh', args, {
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

function normalizeGithubHost(value: string | null | undefined): string {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return DEFAULT_GITHUB_HOST;
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '') || DEFAULT_GITHUB_HOST;
}

async function readGithubCliToken(host: string): Promise<string | null> {
  try {
    const { stdout } = await runGhCommand(['auth', 'token', '--hostname', host], GITHUB_CLI_TOKEN_TIMEOUT_MS);
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function runGithubCliOneClickLogin(githubHost?: string | null): Promise<{ accessToken: string }> {
  const host = normalizeGithubHost(githubHost);

  try {
    await runGhCommand(['--version'], GITHUB_CLI_TOKEN_TIMEOUT_MS);
  } catch {
    throw new Error(`GitHub CLI (gh) wurde nicht gefunden. Bitte installieren: ${GITHUB_CLI_INSTALL_URL}`);
  }

  const existingToken = await readGithubCliToken(host);
  if (existingToken) {
    return { accessToken: existingToken };
  }

  try {
    await runGhCommand(
      ['auth', 'login', '--hostname', host, '--web', '--git-protocol', 'https', '--scopes', 'repo,read:user'],
      GITHUB_CLI_LOGIN_TIMEOUT_MS,
    );
  } catch (error: unknown) {
    const detail = formatExecError(error);
    throw new Error(`GitHub 1-Klick Login fehlgeschlagen (${host}). ${detail}`);
  }

  const token = await readGithubCliToken(host);
  if (!token) {
    throw new Error(`GitHub Login wurde abgeschlossen (${host}), aber kein Token wurde von gh geliefert.`);
  }

  return { accessToken: token };
}
