import { FEEDBACK_REPOSITORY_NAME, FEEDBACK_REPOSITORY_OWNER } from '../../github/GitHubIssueService';

export const feedbackRepositoryUrl = `https://github.com/${FEEDBACK_REPOSITORY_OWNER}/${FEEDBACK_REPOSITORY_NAME}`;
export type FeedbackFormField = { id: string; heading: string; value: string };

/** Preview the final query values, after fitting the URL to browser limits. Diagnostics never enter this list. */
export function buildFeedbackFallback(template: string, title: string, fields: FeedbackFormField[]) {
  const params = new URLSearchParams({ template, title });
  for (const field of fields) if (field.value) params.set(field.id, field.value);
  const base = `${feedbackRepositoryUrl}/issues/new?`;
  let truncated = false;
  while (base.length + params.toString().length > 4_000) {
    const candidate = [...params.entries()]
      .filter(([key, value]) => !['template', 'area', 'affected-area'].includes(key) && Array.from(value).length > (key === 'title' ? 80 : 16))
      .sort((left, right) => right[1].length - left[1].length)[0];
    if (!candidate) throw new Error('Feedback could not fit in a browser URL.');
    const [key, value] = candidate;
    const length = Math.max(key === 'title' ? 80 : 16, Math.floor(Array.from(value).length * 0.7));
    params.set(
      key,
      `${Array.from(value)
        .slice(0, length - 1)
        .join('')}…`,
    );
    truncated = true;
  }
  return {
    url: `${base}${params.toString()}`,
    title: params.get('title')!,
    body: fields
      .filter((field) => params.has(field.id))
      .map((field) => `## ${field.heading}\n${params.get(field.id)}`)
      .join('\n\n'),
    truncated,
  };
}
