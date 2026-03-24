import { execFile } from 'child_process';
import { promisify } from 'util';

const GITHUB_CLI_INSTALL_URL = 'https://cli.github.com/';
const GITHUB_CLI_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const GITHUB_CLI_TOKEN_TIMEOUT_MS = 30 * 1000;
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

async function readGithubCliToken(): Promise<string | null> {
  try {
    const { stdout } = await runGhCommand(['auth', 'token', '--hostname', 'github.com'], GITHUB_CLI_TOKEN_TIMEOUT_MS);
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function runGithubCliOneClickLogin(): Promise<{ accessToken: string }> {
  try {
    await runGhCommand(['--version'], GITHUB_CLI_TOKEN_TIMEOUT_MS);
  } catch {
    throw new Error(`GitHub CLI (gh) wurde nicht gefunden. Bitte installieren: ${GITHUB_CLI_INSTALL_URL}`);
  }

  const existingToken = await readGithubCliToken();
  if (existingToken) {
    return { accessToken: existingToken };
  }

  try {
    await runGhCommand(
      ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--scopes', 'repo,read:user'],
      GITHUB_CLI_LOGIN_TIMEOUT_MS,
    );
  } catch (error: unknown) {
    const detail = formatExecError(error);
    throw new Error(`GitHub 1-Klick Login fehlgeschlagen. ${detail}`);
  }

  const token = await readGithubCliToken();
  if (!token) {
    throw new Error('GitHub Login wurde abgeschlossen, aber kein Token wurde von gh geliefert.');
  }

  return { accessToken: token };
}
