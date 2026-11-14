import {
  FEEDBACK_REPORT_AREAS,
  FEEDBACK_TITLE_MAX,
  FEEDBACK_TEXT_MAX,
  FEEDBACK_DIAGNOSTICS_MAX,
  type FeedbackReportAreaDto,
  type FeedbackReportInputDto,
} from '../../../src/types/feedbackDtos';
import { redactGitSensitiveText } from '../../git/GitErrorFormatter';
import { buildFeedbackFallback, type FeedbackFormField } from './feedbackReportFallback';

export type FeedbackEnvironment = {
  appVersion: string;
  platform: string;
  appArea?: string;
};

export type PreparedFeedbackReport = {
  title: string;
  body: string;
  label: string;
  fallbackUrl: string;
  browserPreview: { title: string; body: string; truncated: boolean };
  diagnosticsIncluded: boolean;
};

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

const requiredText = (value: unknown, label: string, max = FEEDBACK_TEXT_MAX, redactPaths = false): string => {
  const normalized = redactFeedbackText(value, redactPaths).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized.slice(0, max);
};

const optionalText = (value: unknown, max = FEEDBACK_TEXT_MAX): string => redactFeedbackText(value).trim().slice(0, max);

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

export function prepareFeedbackReport(input: FeedbackReportInputDto, environment: FeedbackEnvironment): PreparedFeedbackReport {
  if (!input || !Object.prototype.hasOwnProperty.call(categoryConfig, input.category)) throw new Error('Invalid feedback category.');
  if (input.submissionMode !== 'manual') throw new Error('Only manual feedback reports are supported.');
  const config = categoryConfig[input.category];
  const area = normalizedArea(input.area);
  const source = input.source === 'error-toast' ? 'Error toast' : 'Settings';
  const environmentBlock = environmentMarkdown(environment, area, source);
  const fields: FeedbackFormField[] = [];
  let description: string;
  let diagnostics = '';
  const add = (id: string, heading: string, value: unknown, required = false) => {
    const text = required ? requiredText(value, heading) : optionalText(value);
    if (text) fields.push({ id, heading, value: text });
    return text;
  };
  if (input.category === 'bug') {
    description = add('actual', 'Actual behavior', input.actual, true);
    add('steps', 'Steps to reproduce', input.steps);
    add('expected', 'Expected behavior', input.expected);
    diagnostics = optionalText(input.diagnostics, FEEDBACK_DIAGNOSTICS_MAX);
  } else if (input.category === 'feature') {
    description = add('problem', 'Idea or opportunity', input.problem, true);
    add('workflow', 'Desired workflow', input.desiredWorkflow);
    add('proposal', 'Proposed solution', input.proposal);
    add('value', 'User value', input.value);
  } else {
    description = add('question', 'Question', input.question, true);
    add('context', 'Context', input.context);
    add('tried', 'What I already tried', input.tried);
  }
  const stripPrefix = (value: string) => value.replace(/^\[(?:Bug|Feature|Question)\]:\s*/i, '').trim();
  const firstLine = (value: string) =>
    value
      .split(/\r?\n/)
      .map((line) => stripPrefix(line.trim()))
      .find(Boolean) || '';
  const rawTitle = firstLine(optionalText(input.title, FEEDBACK_TITLE_MAX)) || firstLine(description);
  const title = `${config.prefix} ${Array.from(rawTitle)
    .slice(0, FEEDBACK_TITLE_MAX - config.prefix.length - 1)
    .join('')}`;
  fields.push({ id: 'environment', heading: 'Environment', value: environmentBlock });
  const body = [
    ...fields.map((field) => `## ${field.heading}\n${field.value}`),
    ...(diagnostics ? [`## Diagnostics\n\`\`\`text\n${markdownValue(diagnostics)}\n\`\`\``] : []),
  ].join('\n\n');
  const browser = buildFeedbackFallback(config.template, title, [
    ...fields,
    { id: input.category === 'question' ? 'area' : 'affected-area', heading: 'Affected area', value: formArea(input.category, area) },
  ]);
  return {
    title,
    body,
    label: config.label,
    fallbackUrl: browser.url,
    browserPreview: { title: browser.title, body: browser.body, truncated: browser.truncated },
    diagnosticsIncluded: Boolean(diagnostics),
  };
}
