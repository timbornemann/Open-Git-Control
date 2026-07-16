import { describe, expect, it } from 'vitest';
import { prepareFeedbackReport, redactFeedbackText } from '../feedbackReport';

const environment = { appVersion: '1.3.0', platform: 'win32 11 x64' };

describe('feedbackReport', () => {
  it('builds a structured bug report and a bounded issue-form fallback without diagnostics in the URL', () => {
    const report = prepareFeedbackReport(
      {
        category: 'bug',
        submissionMode: 'manual',
        source: 'settings',
        title: 'Editor loses content',
        area: 'Repository workspace',
        steps: '1. Open a file\n2. Save it',
        expected: 'The content remains.',
        actual: 'The content disappeared.',
        diagnostics: `private-path=${'x'.repeat(10_000)}`,
      },
      environment,
    );

    expect(report.title).toBe('[Bug]: Editor loses content');
    expect(report.label).toBe('bug');
    expect(report.body).toContain('## Diagnostics');
    expect(report.fallbackUrl).toContain('template=bug_report.yml');
    expect(report.fallbackUrl).not.toContain('private-path');
    expect(report.fallbackUrl!.length).toBeLessThanOrEqual(4_000);
  });

  it('rejects automatic reports', () => {
    const input = {
      category: 'bug' as const,
      submissionMode: 'automatic' as const,
      source: 'error-toast' as const,
      title: 'Failure at C:\\Users\\Tim\\private\\repo',
      area: 'Repository workspace' as const,
      errorMessage: 'token=github_pat_abcdefghijklmnopqrstuvwxyz123456 at C:\\Users\\Tim\\private\\repo',
    };

    expect(() => prepareFeedbackReport(input as never, environment)).toThrow('Only manual feedback reports are supported.');
  });

  it('maps feature and question reports to the existing forms and validates required fields', () => {
    const feature = prepareFeedbackReport(
      {
        category: 'feature',
        submissionMode: 'manual',
        source: 'settings',
        title: 'Add a review queue',
        area: 'GitHub integration',
        problem: 'Reviews are scattered.',
        desiredWorkflow: 'Open one queue.',
        proposal: 'Add a queue.',
        value: 'Saves time.',
      },
      environment,
    );
    expect(feature.fallbackUrl).toContain('template=feature_request.yml');
    expect(new URL(feature.fallbackUrl!).searchParams.get('affected-area')).toBe('GitHub workflows');

    expect(() =>
      prepareFeedbackReport(
        {
          category: 'question',
          submissionMode: 'manual',
          source: 'settings',
          title: 'How does this work?',
          area: 'Settings',
          question: '',
          context: 'Trying to configure the app.',
        },
        environment,
      ),
    ).toThrow('Question is required');
  });

  it('redacts common credential formats in arbitrary report text', () => {
    expect(redactFeedbackText('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
    expect(redactFeedbackText('AIzaabcdefghijklmnopqrstuvwxyz1234567890')).toContain('[REDACTED_SECRET]');
  });
});
