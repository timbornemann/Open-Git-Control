export type FeedbackReportCategoryDto = 'bug' | 'feature' | 'question';
export type FeedbackReportSourceDto = 'settings' | 'error-toast';
export type FeedbackReportSubmissionModeDto = 'manual' | 'automatic';
export const FEEDBACK_REPORT_AREAS = [
  'Repository workspace',
  'Commit graph',
  'Staging and commits',
  'Diff viewer',
  'Conflict resolver',
  'GitHub integration',
  'Release creator',
  'Project planning',
  'Settings',
  'Packaging and auto-update',
  'Other',
] as const;
export type FeedbackReportAreaDto = (typeof FEEDBACK_REPORT_AREAS)[number];

type FeedbackReportBaseDto = {
  title: string;
  area: FeedbackReportAreaDto;
  source: FeedbackReportSourceDto;
};

export type ManualBugFeedbackReportDto = FeedbackReportBaseDto & {
  category: 'bug';
  submissionMode: 'manual';
  steps: string;
  expected: string;
  actual: string;
  diagnostics?: string;
};

export type ManualFeatureFeedbackReportDto = FeedbackReportBaseDto & {
  category: 'feature';
  submissionMode: 'manual';
  problem: string;
  desiredWorkflow: string;
  proposal: string;
  value: string;
};

export type ManualQuestionFeedbackReportDto = FeedbackReportBaseDto & {
  category: 'question';
  submissionMode: 'manual';
  question: string;
  context: string;
  tried?: string;
};

export type AutomaticFeedbackReportDto = {
  category: 'bug';
  submissionMode: 'automatic';
  source: 'error-toast';
  title: string;
  area: FeedbackReportAreaDto;
  errorMessage: string;
};

export type FeedbackReportInputDto = ManualBugFeedbackReportDto | ManualFeatureFeedbackReportDto | ManualQuestionFeedbackReportDto | AutomaticFeedbackReportDto;

export type FeedbackReportCapabilityDto = {
  directSubmissionAvailable: boolean;
  reason: 'not-authenticated' | 'wrong-host' | null;
};

export type FeedbackReportErrorCodeDto = 'DIRECT_UNAVAILABLE' | 'RATE_LIMITED' | 'VALIDATION_FAILED' | 'GITHUB_FAILED';

export type FeedbackReportSubmissionResultDto =
  | {
      success: true;
      data: {
        issueNumber: number;
        htmlUrl: string;
        deduplicated: boolean;
      };
    }
  | {
      success: false;
      code: FeedbackReportErrorCodeDto;
      error: string;
      fallbackUrl?: string;
    };
