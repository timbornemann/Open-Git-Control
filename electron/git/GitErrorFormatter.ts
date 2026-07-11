import { createRepoUnavailableErrorMessage, isRepoUnavailableError } from '../../src/shared/git/errors';
import { readGitProcessErrorText } from './GitProcessTypes';

export const EXPECTED_NON_FATAL_GIT_ERROR_NAME = 'ExpectedNonFatalGitError';

export const isMissingOriginGitError = (error: unknown): boolean =>
  /(?:no such remote ['"]?origin['"]?|remote ['"]?origin['"]? not found)/i.test(error instanceof Error ? error.message : String(error));

/** Redacts credentials before a Git failure reaches logs or the renderer. */
export const redactGitSensitiveText = (value: unknown): string => {
  let text = String(value ?? '');

  // Strip every HTTP(S) user-info component. User names are not useful in an
  // error message, and retaining them risks retaining a token-only credential.
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@');
  // SCP-style Git remotes have no scheme and may use a token as their user.
  text = text.replace(/(^|[\s'"(])[^\s/@:]+@([a-z0-9.-]+):([^\s'"),]+)/gi, '$1[REDACTED]@$2:$3');
  text = text.replace(
    /([?&](?:[a-z0-9_-]*(?:token|secret|password|passwd|credential|signature)|api[_-]?key|key|auth(?:orization)?|code|ticket|sig|sas)=)[^&#\s'"]+/gi,
    '$1[REDACTED]',
  );
  text = text.replace(/\b(?:github_pat_[a-z0-9_-]+|gh[a-z]+_[a-z0-9_-]+|glpat-[a-z0-9_-]+|sk-[a-z0-9_-]+)\b/gi, '[REDACTED]');
  text = text.replace(/\b(bearer|token|basic)\s+[a-z0-9._~+\/=:-]{8,}\b/gi, '$1 [REDACTED]');

  return text;
};

export class GitErrorFormatter {
  normalizeGitError(error: unknown, args: string[]): Error {
    const gitOut = readGitProcessErrorText(error, 'stderr').trim() || readGitProcessErrorText(error, 'stdout').trim();
    const fallbackMessage = readGitProcessErrorText(error, 'message') || 'Unknown git error';
    const detailedMessage = gitOut ? `${fallbackMessage}\nGit Output: ${gitOut}` : fallbackMessage;
    const isRepoUnavailable = isRepoUnavailableError(detailedMessage);
    const isExpectedNonFatal = this.isExpectedNonFatalGitError(args, detailedMessage, gitOut);
    const finalMessage = isRepoUnavailable ? createRepoUnavailableErrorMessage(gitOut || fallbackMessage) : detailedMessage;
    const safeFinalMessage = redactGitSensitiveText(finalMessage);

    if (!isRepoUnavailable && !isExpectedNonFatal) {
      const safeArgs = args.map(redactGitSensitiveText).join(' ');
      console.error(`Git Error executing "git ${safeArgs}":\n${safeFinalMessage}`);
    }
    const normalizedError = new Error(safeFinalMessage);
    if (isExpectedNonFatal) {
      normalizedError.name = EXPECTED_NON_FATAL_GIT_ERROR_NAME;
    }
    return normalizedError;
  }

  private isExpectedNonFatalGitError(args: string[], errorText: string, gitOutput: string): boolean {
    const primary = String(args?.[0] || '')
      .trim()
      .toLowerCase();
    const secondary = String(args?.[1] || '')
      .trim()
      .toLowerCase();
    const expectsUpstreamRef = args.some((arg) => String(arg || '').trim() === '@{upstream}');
    if (primary === 'rev-parse' && expectsUpstreamRef) {
      return (
        /no upstream configured for branch/i.test(errorText) ||
        /upstream branch .* not stored as a remote-tracking branch/i.test(errorText) ||
        /fatal: no such branch/i.test(errorText)
      );
    }
    if (primary === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
      return (
        (!gitOutput && /^command failed:\s*git\s+rev-parse\s+--verify\s+--quiet\b/i.test(errorText)) ||
        /needed a single revision|unknown revision or path not in the working tree|ambiguous argument .*unknown revision/i.test(errorText)
      );
    }
    if (primary === 'submodule' && secondary === 'status') {
      return /no submodule mapping found in \.gitmodules for path/i.test(errorText);
    }
    if (primary === 'remote' && secondary === 'get-url' && String(args?.[2] || '').trim() === 'origin') {
      return /no such remote ['"]?origin['"]?/i.test(errorText);
    }
    return false;
  }
}
