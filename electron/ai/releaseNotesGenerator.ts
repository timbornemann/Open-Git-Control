import type { AppSettings } from '../settings';
import type { AiProviderClient } from './AiProviderClient';
import type { GeneratedReleaseNotes, ReleaseCommitInput, ReleaseVersionBump } from './aiServiceTypes';
import { safeHttpUrl } from './jsonResponse';
import { CHAT_TIMEOUT_MS, runProviderText } from './providerText';

type GenerateReleaseNotesParams = {
  tagName: string;
  releaseName: string;
  lastReleaseTag?: string | null;
  commits: ReleaseCommitInput[];
  repositoryHtmlUrl?: string | null;
  language: 'de' | 'en';
  versionBump: ReleaseVersionBump;
  hints?: string[];
};

export async function generateReleaseNotes(
  providerClient: AiProviderClient,
  settings: AppSettings,
  getGeminiApiKey: () => string,
  params: GenerateReleaseNotesParams,
  getOpenAiApiKey: () => string = () => '',
): Promise<GeneratedReleaseNotes> {
  const commits = Array.isArray(params.commits) ? params.commits : [];
  const releaseTypeLabel = params.versionBump === 'major' ? 'Major' : params.versionBump === 'minor' ? 'Minor' : 'Patch';
  if (commits.length === 0) {
    return {
      markdown:
        params.language === 'en'
          ? `# ${params.releaseName}\n\nThis ${releaseTypeLabel.toLowerCase()} release has no new commits since the previous release.`
          : `# ${params.releaseName}\n\nDieses ${releaseTypeLabel} Release enthaelt seit dem vorherigen Release keine neuen Commits.`,
      source: 'fallback',
      warning:
        params.language === 'en'
          ? 'No commits were available; deterministic release notes were generated.'
          : 'Es waren keine Commits verfuegbar; deterministische Release Notes wurden erstellt.',
    };
  }

  const systemPrompt = [
    'You write high-quality software release notes in Markdown.',
    'Style: clear, factual, concise, informative, and easy to scan.',
    'Do not invent changes. Use only the provided commit data.',
    'Do not invent URLs, repository links, or commit links.',
    'Use Markdown links only when an explicit URL is provided in the input.',
    'Group related changes into meaningful sections.',
    'Include a short summary and a complete changelog section.',
    'Use the provided semantic version classification explicitly in the opening summary.',
  ].join(' ');

  const languageInstruction = params.language === 'en' ? 'Write in English.' : 'Write in German.';
  const releaseTypeInstruction =
    params.language === 'en'
      ? `Explicitly call this a ${releaseTypeLabel.toLowerCase()} release in the opening summary.`
      : `Bezeichne dies in der Einleitung ausdruecklich als ${releaseTypeLabel} Release.`;
  const majorReleaseInstruction =
    params.versionBump === 'major'
      ? 'Give supported breaking changes and migration requirements high visibility, but do not invent any.'
      : 'Do not infer breaking changes or compatibility claims from the release type alone.';
  const hintLines = Array.isArray(params.hints) ? params.hints.filter((hint) => typeof hint === 'string' && hint.trim().length > 0).slice(0, 12) : [];
  const repositoryHtmlUrl = safeHttpUrl(params.repositoryHtmlUrl);

  const userPrompt = [
    `Release name: ${params.releaseName}`,
    `Release tag: ${params.tagName}`,
    `Previous release tag: ${params.lastReleaseTag || 'none'}`,
    `Repository URL: ${repositoryHtmlUrl || 'none'}`,
    `Semantic version change: ${params.versionBump}`,
    languageInstruction,
    releaseTypeInstruction,
    majorReleaseInstruction,
    'URL policy: Use only URLs provided in "Repository URL" or commit url= fields. Do not invent, guess, shorten, or replace URLs. Never write example.com or any placeholder URL. If no URL is provided, write plain text without a link.',
    ...(hintLines.length > 0 ? ['Additional style instructions:', ...hintLines.map((hint) => `- ${hint}`)] : []),
    'Commits (short hash | subject | author | date | url):',
    ...commits.map((commit) => {
      const commitUrl = safeHttpUrl(commit.htmlUrl);
      return `- ${commit.shortHash} | ${commit.subject} | ${commit.author} | ${commit.date} | url=${commitUrl || 'none'}`;
    }),
    'Output valid Markdown only.',
  ].join('\n');

  let providerFailure = 'Der KI-Provider lieferte keine Release Notes.';
  try {
    const result = await runProviderText(providerClient, settings, systemPrompt, userPrompt, getGeminiApiKey, undefined, CHAT_TIMEOUT_MS, getOpenAiApiKey);
    const markdown = result.trim();
    if (markdown) return { markdown, source: 'ai' };
  } catch (error: unknown) {
    providerFailure = error instanceof Error ? error.message : providerFailure;
  }

  const heading = `# ${params.releaseName}`;
  const intro =
    params.language === 'en'
      ? `\n\nRelease type: ${releaseTypeLabel}\n\nTag: \`${params.tagName}\`\n\n## Changelog\n`
      : `\n\nRelease-Typ: ${releaseTypeLabel}\n\nTag: \`${params.tagName}\`\n\n## Aenderungen\n`;
  const changelog = commits
    .map((commit) => {
      const commitUrl = safeHttpUrl(commit.htmlUrl);
      const hashReference = commitUrl ? `[${commit.shortHash}](${commitUrl})` : commit.shortHash;
      return `- ${commit.subject} (${hashReference})`;
    })
    .join('\n');

  return {
    markdown: `${heading}${intro}${changelog}`.trim(),
    source: 'fallback',
    warning:
      params.language === 'en'
        ? `AI generation failed; deterministic release notes were generated instead. ${providerFailure}`
        : `KI-Generierung fehlgeschlagen; stattdessen wurden deterministische Release Notes erstellt. ${providerFailure}`,
  };
}
