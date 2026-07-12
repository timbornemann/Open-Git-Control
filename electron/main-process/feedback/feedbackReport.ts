import { createHash } from 'crypto';
import { FEEDBACK_REPORT_AREAS, type FeedbackReportAreaDto, type FeedbackReportInputDto } from '../../../src/types/feedbackDtos';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { FEEDBACK_REPOSITORY_NAME, FEEDBACK_REPOSITORY_OWNER } from '../../github/GitHubIssueService';

export type FeedbackEnvironment = {
  appVersion: string;
  platform: string;
  appArea?: string;
};

export type PreparedFeedbackReport = {
  title: string;
  body: string;
  label: string;
  fallbackUrl: string | null;
  signature: string | null;
};

const TITLE_MAX = 180;
const FIELD_MAX = 8_000;
const DIAGNOSTICS_MAX = 20_000;
const FALLBACK_URL_MAX = 4_000;
const categoryConfig = {
  bug: { prefix: '[Bug]:', label: 'bug', template: 'bug_report.yml' },
  feature: { prefix: '[Feature]:', label: 'enhancement', template: 'feature_request.yml' },
  question: { prefix: '[Question]:', label: 'question', template: 'question.yml' },
} as const;

const secretPatterns: RegExp[] = [
  /\b(?:github_pat_[a-z0-9_-]+|gh[pousr]_[a-z0-9_-]+|glpat-[a-z0-9_-]+)\b/gi,
  /\b(?:sk-(?:proj-|svcacct-|ant-api\d{2,}-|or-v1-)?|gsk_|hf_|r8_|xai-|pplx-)[a-z0-9_\-]{16,}\b/gi,
  /\bAIza[a-z0-9_-]{30,}\b/gi,
  /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi,
  /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["']?[^\s"']{12,}["']?/gi,
];

export const redactFeedbackText = (value: unknown, redactPaths = false): string => {
  let text = redactGitSensitiveText(value).replace(/\[REDACTED\]/g, '[REDACTED_SECRET]');
  for (const pattern of secretPatterns) text = text.replace(pattern, '[REDACTED_SECRET]');
  if (redactPaths) {
    text = text.replace(/\b[A-Za-z]:\\(?:[^\s<>:"|?*]+\\)*[^\s<>:"|?*]*/g, '[REDACTED_PATH]');
    text = text.replace(/\/(?:Users|home|var|tmp)\/(?:[^\s/]+\/)*[^\s]*/g, '[REDACTED_PATH]');
  }
  return text;
};

const requiredText = (value: unknown, label: string, max = FIELD_MAX, redactPaths = false): string => {
  const normalized = redactFeedbackText(value, redactPaths).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized.slice(0, max);
};

const optionalText = (value: unknown, max = FIELD_MAX): string => redactFeedbackText(value).trim().slice(0, max);

const normalizedArea = (value: unknown): FeedbackReportAreaDto =>
  FEEDBACK_REPORT_AREAS.includes(value as FeedbackReportAreaDto) ? (value as FeedbackReportAreaDto) : 'Other';

const markdownValue = (value: string): string => value.replace(/```/g, '``\u200b`');

const environmentMarkdown = (environment: FeedbackEnvironment, area: string, source: string): string =>
  [`- Open-Git-Control: ${environment.appVersion}`, `- Platform: ${environment.platform}`, `- Area: ${area}`, `- Source: ${source}`].join('\n');

const formArea = (category: FeedbackReportInputDto['category'], area: FeedbackReportAreaDto): string => {
  if (category === 'question') {
    if (area === 'GitHub integration') return 'GitHub authentication or pull requests';
    if (area === 'Release creator') return 'Releases';
    if (area === 'Project planning') return 'Project planning API/MCP';
    if (area === 'Packaging and auto-update') return 'Installation or updates';
    if (['Repository workspace', 'Commit graph', 'Staging and commits', 'Diff viewer', 'Conflict resolver'].includes(area)) return 'Git workflow';
    return 'Other / Andere';
  }
  if (area === 'GitHub integration') return category === 'feature' ? 'GitHub workflows' : 'GitHub authentication';
  if (area === 'Project planning') return 'Project planning API/MCP';
  if (area === 'Packaging and auto-update') return 'Packaging, install, or auto-update';
  if (area === 'Other') return 'Other / Andere';
  return area;
};

const fallbackUrl = (input: FeedbackReportInputDto, title: string, environment: FeedbackEnvironment, fields: Record<string, string>): string | null => {
  if (input.submissionMode === 'automatic') return null;
  const config = categoryConfig[input.category];
  const params = new URLSearchParams({ template: config.template, title });
  for (const [key, value] of Object.entries(fields)) {
    if (value) params.set(key, value.slice(0, 700));
  }
  params.set('app-version', environment.appVersion);
  const urlBase = `https://github.com/${FEEDBACK_REPOSITORY_OWNER}/${FEEDBACK_REPOSITORY_NAME}/issues/new`;
  let result = `${urlBase}?${params.toString()}`;
  while (result.length > FALLBACK_URL_MAX) {
    const candidates = [...params.entries()].filter(([key, value]) => key !== 'template' && key !== 'title' && value.length > 80);
    const longest = candidates.sort((left, right) => right[1].length - left[1].length)[0];
    if (!longest) break;
    params.set(longest[0], `${longest[1].slice(0, Math.max(80, Math.floor(longest[1].length * 0.7)))}…`);
    result = `${urlBase}?${params.toString()}`;
  }
  return result.length <= FALLBACK_URL_MAX
    ? result
    : `${urlBase}?template=${encodeURIComponent(config.template)}&title=${encodeURIComponent(title.slice(0, 100))}`;
};

export function prepareFeedbackReport(input: FeedbackReportInputDto, environment: FeedbackEnvironment): PreparedFeedbackReport {
  if (!input || !categoryConfig[input.category]) throw new Error('Invalid feedback category.');
  const config = categoryConfig[input.category];
  const rawTitle = requiredText(input.title, 'Title', TITLE_MAX, input.submissionMode === 'automatic').replace(/^\[(?:Bug|Feature|Question)\]:\s*/i, '');
  const title = `${config.prefix} ${rawTitle}`.slice(0, TITLE_MAX + config.prefix.length + 1);
  const area = normalizedArea(input.area);
  const source = input.source === 'error-toast' ? 'Error toast' : 'Settings';
  const environmentBlock = environmentMarkdown(environment, area, source);

  if (input.submissionMode === 'automatic') {
    const errorMessage = requiredText(input.errorMessage, 'Error message', FIELD_MAX, true);
    const signature = createHash('sha256').update(`${environment.appVersion}\0${area}\0${errorMessage}`).digest('hex');
    const body = [
      '## Actual behavior',
      errorMessage,
      '',
      '## Context',
      'Automatically captured after explicit user consent. No diagnostics or repository details were attached.',
      '',
      '## Environment',
      environmentBlock,
      '',
      `<!-- open-git-control-error-signature:${signature} -->`,
    ].join('\n');
    return { title, body, label: config.label, fallbackUrl: null, signature };
  }

  if (input.category === 'bug') {
    const steps = requiredText(input.steps, 'Steps');
    const expected = requiredText(input.expected, 'Expected behavior');
    const actual = requiredText(input.actual, 'Actual behavior');
    const diagnostics = optionalText(input.diagnostics, DIAGNOSTICS_MAX);
    const body = [
      '## Steps to reproduce',
      steps,
      '',
      '## Expected behavior',
      expected,
      '',
      '## Actual behavior',
      actual,
      '',
      '## Environment',
      environmentBlock,
      ...(diagnostics ? ['', '## Diagnostics', '```text', markdownValue(diagnostics), '```'] : []),
    ].join('\n');
    return {
      title,
      body,
      label: config.label,
      signature: null,
      fallbackUrl: fallbackUrl(input, title, environment, { steps, expected, actual, 'affected-area': formArea(input.category, area) }),
    };
  }

  if (input.category === 'feature') {
    const problem = requiredText(input.problem, 'Problem');
    const desiredWorkflow = requiredText(input.desiredWorkflow, 'Desired workflow');
    const proposal = requiredText(input.proposal, 'Proposal');
    const value = requiredText(input.value, 'User value');
    const body = [
      '## Problem or opportunity',
      problem,
      '',
      '## Desired workflow',
      desiredWorkflow,
      '',
      '## Proposed solution',
      proposal,
      '',
      '## User value',
      value,
      '',
      '## Environment',
      environmentBlock,
    ].join('\n');
    return {
      title,
      body,
      label: config.label,
      signature: null,
      fallbackUrl: fallbackUrl(input, title, environment, {
        problem,
        workflow: desiredWorkflow,
        proposal,
        value,
        'affected-area': formArea(input.category, area),
      }),
    };
  }

  const question = requiredText(input.question, 'Question');
  const context = requiredText(input.context, 'Context');
  const tried = optionalText(input.tried);
  const body = [
    '## Question',
    question,
    '',
    '## Context',
    context,
    ...(tried ? ['', '## What I already tried', tried] : []),
    '',
    '## Environment',
    environmentBlock,
  ].join('\n');
  return {
    title,
    body,
    label: config.label,
    signature: null,
    fallbackUrl: fallbackUrl(input, title, environment, { question, context, tried, area: formArea(input.category, area) }),
  };
}
