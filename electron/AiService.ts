import type { GitService } from './GitService';
import { gitService } from './GitService';
import type { AiProvider, AppSettings } from './settings';
import { AiProviderClient, getSelectedAiModel } from './ai/AiProviderClient';
import { AiAutoCommitRunner } from './ai/AiAutoCommitRunner';
import { buildFallbackCommitMessage, generateCommitMessageFromUserNotes as generateCommitMessageFromUserNotesCore } from './ai/commitMessageGenerator';
import { generateReleaseNotes as generateReleaseNotesCore } from './ai/releaseNotesGenerator';
import type { AiAutoCommitResult, AiProgressUpdate, CommitMessage, ReleaseCommitInput, ReleaseVersionBump } from './ai/aiServiceTypes';

export type { AiAutoCommitResult, AiProgressUpdate, CommitMessage, ReleaseCommitInput, ReleaseVersionBump } from './ai/aiServiceTypes';

export { buildFallbackCommitMessage };
export { parseStatusPorcelain } from './ai/gitStatusSnapshot';
export { buildStructuredDiffContext } from './ai/diffContext';

const aiProviderClient = new AiProviderClient();

const assertGenerationConfigured = (settings: AppSettings, getGeminiApiKey: () => string, getOpenAiApiKey: () => string = () => '') => {
  const model = getSelectedAiModel(settings);
  if (!model) {
    throw new Error('Kein KI-Modell konfiguriert.');
  }

  if (settings.aiProvider === 'gemini') {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }
  }

  if (settings.aiProvider === 'openai') {
    const apiKey = getOpenAiApiKey().trim();
    if (!apiKey) {
      throw new Error('OpenAI API key fehlt.');
    }
  }
};

export class AiService {
  private readonly autoCommitRunner: AiAutoCommitRunner;

  constructor(
    private readonly gitService: GitService,
    private readonly providerClient: AiProviderClient = aiProviderClient,
  ) {
    this.autoCommitRunner = new AiAutoCommitRunner(gitService, providerClient);
  }

  async testConnection(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    getOpenAiApiKey: () => string = () => '',
  ): Promise<{ ok: true; provider: AiProvider; model: string; detail: string }> {
    return this.providerClient.testConnection(settings, getGeminiApiKey, getOpenAiApiKey);
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string, getOpenAiApiKey: () => string = () => ''): Promise<string[]> {
    return this.providerClient.listModels(settings, getGeminiApiKey, getOpenAiApiKey);
  }

  async generateCommitMessageFromUserNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: { notes: string },
    getOpenAiApiKey: () => string = () => '',
  ): Promise<CommitMessage> {
    assertGenerationConfigured(settings, getGeminiApiKey, getOpenAiApiKey);
    return generateCommitMessageFromUserNotesCore(this.providerClient, settings, getGeminiApiKey, params, undefined, getOpenAiApiKey);
  }

  async generateReleaseNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: {
      tagName: string;
      releaseName: string;
      lastReleaseTag?: string | null;
      commits: ReleaseCommitInput[];
      repositoryHtmlUrl?: string | null;
      language: 'de' | 'en';
      versionBump: ReleaseVersionBump;
      hints?: string[];
    },
    getOpenAiApiKey: () => string = () => '',
  ): Promise<string> {
    return generateReleaseNotesCore(this.providerClient, settings, getGeminiApiKey, params, getOpenAiApiKey);
  }

  async runAutoCommit(
    repoPath: string,
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
    getOpenAiApiKey?: () => string,
  ): Promise<AiAutoCommitResult>;
  async runAutoCommit(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
    getOpenAiApiKey?: () => string,
  ): Promise<AiAutoCommitResult>;
  async runAutoCommit(
    repoPathOrSettings: string | AppSettings,
    settingsOrGetGeminiApiKey: AppSettings | (() => string),
    getGeminiApiKeyOrOnProgress?: (() => string) | ((update: AiProgressUpdate) => void),
    onProgressOrShouldCancel?: ((update: AiProgressUpdate) => void) | (() => boolean),
    shouldCancelOrGetOpenAiApiKey?: (() => boolean) | (() => string),
    maybeGetOpenAiApiKey?: () => string,
  ): Promise<AiAutoCommitResult> {
    if (typeof repoPathOrSettings === 'string') {
      const repoPath = this.gitService.resolveRepositoryPath(repoPathOrSettings);
      return this.autoCommitRunner.run(
        repoPath,
        settingsOrGetGeminiApiKey as AppSettings,
        getGeminiApiKeyOrOnProgress as () => string,
        onProgressOrShouldCancel as ((update: AiProgressUpdate) => void) | undefined,
        shouldCancelOrGetOpenAiApiKey as (() => boolean) | undefined,
        maybeGetOpenAiApiKey || (() => ''),
      );
    }

    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) throw new Error('No repository selected.');
    return this.autoCommitRunner.run(
      repoPath,
      repoPathOrSettings,
      settingsOrGetGeminiApiKey as () => string,
      getGeminiApiKeyOrOnProgress as ((update: AiProgressUpdate) => void) | undefined,
      onProgressOrShouldCancel as (() => boolean) | undefined,
      (shouldCancelOrGetOpenAiApiKey as (() => string) | undefined) || (() => ''),
    );
  }
}

export const aiService = new AiService(gitService);
