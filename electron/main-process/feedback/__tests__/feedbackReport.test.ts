import { describe, expect, it } from 'vitest';
import { prepareFeedbackReport, redactFeedbackText } from '../feedbackReport';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { FEEDBACK_REPORT_AREAS, FEEDBACK_TITLE_MAX, type FeedbackReportInputDto } from '../../../../src/types/feedbackDtos';

const environment = { appVersion: '1.3.0', platform: 'win32 11 x64' };

describe('feedbackReport', () => {
  const minimal = [
    { category: 'bug', actual: 'The editor loses content.', prefix: 'Bug', field: 'actual', template: 'bug_report.yml' },
    { category: 'feature', problem: 'A review queue would help.', prefix: 'Feature', field: 'problem', template: 'feature_request.yml' },
    { category: 'question', question: 'How can I stage a file?', prefix: 'Question', field: 'question', template: 'question.yml' },
  ] as const;
  it.each(minimal)('accepts a minimal $category report and derives the title without empty extra sections', ({ prefix, field, template, ...values }) => {
    const input = { ...values, submissionMode: 'manual', source: 'settings' } as FeedbackReportInputDto;
    const report = prepareFeedbackReport(input, environment);
    const description = (values as Record<string, string>)[field];
    expect(report.title).toBe(`[${prefix}]: ${description}`);
    expect(report.body).toContain(description);
    expect(report.body).toContain('Open-Git-Control: 1.3.0');
    expect(report.body).not.toMatch(
      /## (Steps to reproduce|Expected behavior|Desired workflow|Proposed solution|User value|Context|What I already tried|Diagnostics)/,
    );
    const query = new URL(report.fallbackUrl).searchParams;
    expect(query.get('template')).toBe(template);
    expect(query.get(field)).toBe(description);
    expect(report.browserPreview.body).toContain(description);
  });
  it('uses the first meaningful line, honors a custom title and keeps generated titles bounded and redacted', () => {
    const input = { category: 'bug', submissionMode: 'manual', source: 'settings', actual: '\n[Bug]:\n  Actual error here  \nDetails', title: '' } as const;
    expect(prepareFeedbackReport(input, environment).title).toBe('[Bug]: Actual error here');
    expect(prepareFeedbackReport({ ...input, title: '[Bug]: My own title\nDo not put this in the title' }, environment).title).toBe('[Bug]: My own title');
    const report = prepareFeedbackReport(
      { ...input, actual: `token=github_pat_abcdefghijklmnopqrstuvwxyz123456\n${'More context. '.repeat(1_000)}` },
      environment,
    );
    expect(report.title).not.toContain('github_pat_');
    expect(report.body).not.toContain('github_pat_');
    expect(report.title.length).toBeLessThanOrEqual(FEEDBACK_TITLE_MAX);
    expect(prepareFeedbackReport({ ...input, actual: 'A'.repeat(500) }, environment).title.length).toBe(FEEDBACK_TITLE_MAX);
  });
  it.each(minimal)('still rejects a blank primary text for $category even with a custom title', ({ field, ...values }) => {
    expect(() =>
      prepareFeedbackReport(
        { ...values, [field]: ' \n ', title: 'A title', source: 'settings', submissionMode: 'manual' } as FeedbackReportInputDto,
        environment,
      ),
    ).toThrow('is required');
  });
  it('previews the actual shortened browser fields and omits diagnostics and secrets from its URL', () => {
    const report = prepareFeedbackReport(
      {
        category: 'feature',
        submissionMode: 'manual',
        source: 'settings',
        title: '🚀'.repeat(200),
        problem: '界'.repeat(8_000),
        desiredWorkflow: '🚀'.repeat(4_000),
        proposal: 'P'.repeat(8_000),
        value: 'V'.repeat(8_000),
        area: 'GitHub integration',
      },
      environment,
    );
    expect(report.fallbackUrl.length).toBeLessThanOrEqual(4_000);
    expect(report.browserPreview.truncated).toBe(true);
    const query = new URL(report.fallbackUrl).searchParams;
    for (const field of ['problem', 'workflow', 'proposal', 'value', 'environment']) {
      expect(query.get(field)).toBeTruthy();
      expect(report.browserPreview.body).toContain(query.get(field));
    }
    expect(report.browserPreview.title).toBe(query.get('title'));
    expect(query.get('affected-area')).toBe('GitHub workflows');
    expect(report.browserPreview.body).not.toContain('�');
  });
  it.each(minimal)(
    'keeps the $category GitHub form compatible with every prefilled field and requires only the primary description',
    ({ field, template, ...values }) => {
      const form = parseYaml(readFileSync(resolve(__dirname, '../../../../.github/ISSUE_TEMPLATE', template), 'utf8'));
      expect(form.body.filter((entry: any) => entry.validations?.required).map((entry: any) => entry.id)).toEqual([field]);
      for (const area of FEEDBACK_REPORT_AREAS) {
        const report = prepareFeedbackReport({ ...values, area, submissionMode: 'manual', source: 'settings' } as FeedbackReportInputDto, environment);
        for (const [key, value] of new URL(report.fallbackUrl).searchParams) {
          if (key === 'title' || key === 'template') continue;
          const target = form.body.find((entry: any) => entry.id === key);
          expect(target, key).toBeTruthy();
          if (target.type === 'dropdown') expect(target.attributes.options).toContain(value);
        }
      }
    },
  );
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
