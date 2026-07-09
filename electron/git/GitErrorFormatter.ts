import { createRepoUnavailableErrorMessage, isRepoUnavailableError } from '../../src/shared/git/errors';
import { readGitProcessErrorText } from './GitProcessTypes';

export class GitErrorFormatter {
  normalizeGitError(error: unknown, args: string[]): Error {
    const gitOut = readGitProcessErrorText(error, 'stderr').trim() || readGitProcessErrorText(error, 'stdout').trim();
    const fallbackMessage = readGitProcessErrorText(error, 'message') || 'Unknown git error';
    const detailedMessage = gitOut ? `${fallbackMessage}\nGit Output: ${gitOut}` : fallbackMessage;
    const isRepoUnavailable = isRepoUnavailableError(detailedMessage);
    const isExpectedNonFatal = this.isExpectedNonFatalGitError(args, detailedMessage);
    const finalMessage = isRepoUnavailable ? createRepoUnavailableErrorMessage(gitOut || fallbackMessage) : detailedMessage;

    if (!isRepoUnavailable && !isExpectedNonFatal) {
      console.error(`Git Error executing "git ${args.join(' ')}":\n${finalMessage}`);
    }
    return new Error(finalMessage);
  }

  private isExpectedNonFatalGitError(args: string[], errorText: string): boolean {
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
      return true;
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
