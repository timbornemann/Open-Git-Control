import { app, ipcMain } from 'electron';
import * as os from 'os';
import type { GitHubService } from '../../GitHubService';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { FeedbackReportCapabilityDto, FeedbackReportInputDto, FeedbackReportSubmissionResultDto } from '../../../src/types/feedbackDtos';
import { FeedbackReportHistoryStore } from '../feedback/feedbackReportHistory';
import { prepareFeedbackReport, redactFeedbackText } from '../feedback/feedbackReport';

type RegisterFeedbackHandlersDeps = {
  githubService: GitHubService;
  historyStore?: FeedbackReportHistoryStore;
};

const capabilityFor = (githubService: GitHubService): FeedbackReportCapabilityDto => {
  if (!githubService.isAuthenticated()) return { directSubmissionAvailable: false, reason: 'not-authenticated' };
  if (githubService.normalizeHost(githubService.getHost()) !== 'github.com') return { directSubmissionAvailable: false, reason: 'wrong-host' };
  return { directSubmissionAvailable: true, reason: null };
};

export function registerFeedbackHandlers({ githubService, historyStore = new FeedbackReportHistoryStore() }: RegisterFeedbackHandlersDeps): void {
  ipcMain.handle(IpcChannel.FeedbackGetCapability, async () => capabilityFor(githubService));

  ipcMain.handle(IpcChannel.FeedbackSubmit, async (_event: unknown, input: FeedbackReportInputDto): Promise<FeedbackReportSubmissionResultDto> => {
    let prepared: ReturnType<typeof prepareFeedbackReport>;
    try {
      prepared = prepareFeedbackReport(input, {
        appVersion: app.getVersion(),
        platform: `${process.platform} ${os.release()} ${process.arch}`,
      });
    } catch (error: unknown) {
      return { success: false, code: 'VALIDATION_FAILED', error: error instanceof Error ? redactFeedbackText(error.message) : 'Invalid feedback report.' };
    }

    const capability = capabilityFor(githubService);
    if (!capability.directSubmissionAvailable) {
      return {
        success: false,
        code: 'DIRECT_UNAVAILABLE',
        error: capability.reason === 'wrong-host' ? 'Direct reports require a GitHub.com session.' : 'Direct reports require GitHub authentication.',
        ...(input.submissionMode === 'manual' && prepared.fallbackUrl ? { fallbackUrl: prepared.fallbackUrl } : {}),
      };
    }

    const createIssue = () => githubService.createFeedbackIssue(prepared.title, prepared.body, prepared.label);
    if (input.submissionMode === 'automatic') {
      if (!prepared.signature) return { success: false, code: 'VALIDATION_FAILED', error: 'Automatic report signature is missing.' };
      try {
        const result = await historyStore.submit(prepared.signature, createIssue);
        if (result.kind === 'rate-limited') {
          return { success: false, code: 'RATE_LIMITED', error: 'Automatic feedback report limit reached for the last 24 hours.' };
        }
        return {
          success: true,
          data: { issueNumber: result.issueNumber, htmlUrl: result.htmlUrl, deduplicated: result.kind === 'duplicate' },
        };
      } catch (error: unknown) {
        return {
          success: false,
          code: 'GITHUB_FAILED',
          error: error instanceof Error ? redactFeedbackText(error.message) : 'GitHub issue could not be created.',
        };
      }
    }

    try {
      const issue = await createIssue();
      return { success: true, data: { issueNumber: issue.number, htmlUrl: issue.htmlUrl, deduplicated: false } };
    } catch (error: unknown) {
      return {
        success: false,
        code: 'GITHUB_FAILED',
        error: error instanceof Error ? redactFeedbackText(error.message) : 'GitHub issue could not be created.',
        ...(prepared.fallbackUrl ? { fallbackUrl: prepared.fallbackUrl } : {}),
      };
    }
  });
}
