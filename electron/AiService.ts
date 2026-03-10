
import { GitService, gitService } from './GitService';
import { AppSettings, AiProvider } from './settings';

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type AssistantToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  rawFunctionCall?: Record<string, unknown>;
};

type ConversationMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AssistantToolCall[];
  toolName?: string;
  rawGeminiParts?: Array<Record<string, unknown>>;
};

type StatusEntry = {
  path: string;
  x: string;
  y: string;
  code: string;
};

type AiCommit = {
  hash: string;
  subject: string;
};

export type AiAutoCommitResult = {
  commits: AiCommit[];
  summary: string;
  turns: number;
};

const MAX_TURNS = 24;
const MAX_DIFF_CHARS = 12000;
const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseStatusPorcelain(statusOutput: string): StatusEntry[] {
  if (!statusOutput.trim()) return [];

  return statusOutput
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length >= 3)
    .map(line => {
      const x = line[0];
      const y = line[1];
      const rawPath = line.slice(3).trim();
      const renamedParts = rawPath.split(' -> ');
      const path = renamedParts.length > 1 ? renamedParts[renamedParts.length - 1].trim() : rawPath;
      return { path, x, y, code: `${x}${y}` };
    })
    .filter(entry => entry.path.length > 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function trimDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated]`;
}

function buildTools(): ToolDefinition[] {
  return [
    {
      name: 'get_status',
      description: 'Returns current git status split by staged/unstaged/untracked/conflicts.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'get_diff',
      description: 'Returns textual git diff for one file path. Use staged=true for index diff.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          staged: { type: 'boolean' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'stage_files',
      description: 'Stages the provided file paths.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['paths'],
        additionalProperties: false,
      },
    },
    {
      name: 'unstage_files',
      description: 'Unstages the provided file paths.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['paths'],
        additionalProperties: false,
      },
    },
    {
      name: 'commit',
      description: 'Creates one commit from currently staged files.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          signoff: { type: 'boolean' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    {
      name: 'finish',
      description: 'Signal that all desired commits are done and return a short summary.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  ];
}


function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiSchema);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    if (key === 'additionalProperties' || key === '') {
      continue;
    }
    output[key] = sanitizeGeminiSchema(child);
  }

  return output;
}
function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

function getSelectedModel(settings: AppSettings): string {
  return settings.aiProvider === 'gemini'
    ? normalizeGeminiModel(settings.geminiModel)
    : settings.ollamaModel.trim();
}

async function runProviderChat(
  settings: AppSettings,
  messages: ConversationMessage[],
  tools: ToolDefinition[],
  getGeminiApiKey: () => string,
): Promise<{ content: string; toolCalls: AssistantToolCall[]; rawGeminiParts?: Array<Record<string, unknown>> }> {
  if (settings.aiProvider === 'gemini') {
    return runGeminiChat(settings, messages, tools, getGeminiApiKey);
  }
  return runOllamaChat(settings, messages, tools);
}

async function runOllamaChat(
  settings: AppSettings,
  messages: ConversationMessage[],
  tools: ToolDefinition[],
): Promise<{ content: string; toolCalls: AssistantToolCall[]; rawGeminiParts?: Array<Record<string, unknown>> }> {
  const response = await fetch(`${settings.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.ollamaModel,
      stream: false,
      messages: messages.map(message => {
        if (message.role === 'tool') {
          return { role: 'tool', content: message.content };
        }

        return {
          role: message.role,
          content: message.content,
          ...(message.toolCalls && message.toolCalls.length > 0
            ? {
                tool_calls: message.toolCalls.map(call => ({
                  function: {
                    name: call.name,
                    arguments: call.arguments,
                  },
                })),
              }
            : {}),
        };
      }),
      tools: tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama chat failed (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as {
    message?: {
      content?: unknown;
      tool_calls?: Array<{ function?: { name?: unknown; arguments?: unknown } }>;
    };
  };

  const toolCalls = Array.isArray(data.message?.tool_calls)
    ? data.message!.tool_calls
        .map(call => ({
          name: safeString(call.function?.name).trim(),
          arguments: parseJsonObject(call.function?.arguments),
        }))
        .filter(call => call.name.length > 0)
    : [];

  return {
    content: safeString(data.message?.content),
    toolCalls,
  };
}

async function runGeminiChat(
  settings: AppSettings,
  messages: ConversationMessage[],
  tools: ToolDefinition[],
  getGeminiApiKey: () => string,
): Promise<{ content: string; toolCalls: AssistantToolCall[]; rawGeminiParts?: Array<Record<string, unknown>> }> {
  const apiKey = getGeminiApiKey().trim();
  if (!apiKey) {
    throw new Error('Gemini API key is missing.');
  }

  const model = normalizeGeminiModel(settings.geminiModel);
  if (!model) {
    throw new Error('Gemini model is missing.');
  }

  const systemInstruction = messages.find(message => message.role === 'system')?.content || '';
  const rest = messages.filter(message => message.role !== 'system');
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  for (const message of rest) {
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.content }] });
      continue;
    }

    if (message.role === 'assistant') {
      if (Array.isArray(message.rawGeminiParts) && message.rawGeminiParts.length > 0) {
        contents.push({ role: 'model', parts: message.rawGeminiParts });
        continue;
      }

      const parts: Array<Record<string, unknown>> = [];
      if (message.content.trim()) {
        parts.push({ text: message.content });
      }
      for (const call of message.toolCalls || []) {
        const functionCallPayload: Record<string, unknown> = call.rawFunctionCall
          ? { ...call.rawFunctionCall }
          : {};
        functionCallPayload.name = call.name;
        functionCallPayload.args = call.arguments;
        parts.push({ functionCall: functionCallPayload });
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: message.toolName || 'tool', response: parseJsonObject(message.content) } }],
      });
    }
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: tools.map(tool => ({ name: tool.name, description: tool.description, parameters: sanitizeGeminiSchema(tool.parameters) })) }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini chat failed (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: unknown;
          functionCall?: Record<string, unknown>;
        }>;
      };
    }>;
  };

  const rawParts = Array.isArray(data.candidates?.[0]?.content?.parts)
    ? (data.candidates?.[0]?.content?.parts as Array<Record<string, unknown>>)
    : [];

  let content = '';
  const toolCalls: AssistantToolCall[] = [];

  for (const part of rawParts) {
    if (typeof part.text === 'string') {
      content += part.text;
    }
    if (part.functionCall) {
      const functionCall = part.functionCall as Record<string, unknown>;
      const name = safeString(functionCall.name).trim();
      if (name) {
        toolCalls.push({
          name,
          arguments: parseJsonObject(functionCall.args),
          rawFunctionCall: functionCall,
        });
      }
    }
  }

  return { content, toolCalls, rawGeminiParts: rawParts };
}

export class AiService {
  constructor(private readonly gitService: GitService) {}

  async testConnection(settings: AppSettings, getGeminiApiKey: () => string): Promise<{ ok: true; provider: AiProvider; model: string; detail: string }> {
    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }

      const model = normalizeGeminiModel(settings.geminiModel);
      if (!model) {
        throw new Error('Gemini Modell fehlt.');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini nicht erreichbar (${response.status}): ${text || response.statusText}`);
      }

      return { ok: true, provider: 'gemini', model, detail: 'Gemini API erreichbar' };
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/version`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    const json = (await response.json()) as { version?: unknown };
    return { ok: true, provider: 'ollama', model: settings.ollamaModel, detail: `Ollama ${safeString(json.version, 'unknown')}` };
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string): Promise<string[]> {
    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
      }

      const data = (await response.json()) as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
      const models = Array.isArray(data.models) ? data.models : [];
      return uniqueSorted(
        models
          .filter(model => {
            const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
            return methods.includes('generateContent');
          })
          .map(model => normalizeGeminiModel(safeString(model.name)))
          .filter(Boolean),
      );
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> };
    const models = Array.isArray(data.models) ? data.models : [];
    return uniqueSorted(
      models
        .map(model => safeString(model.name || model.model).trim())
        .filter(Boolean),
    );
  }

  async runAutoCommit(settings: AppSettings, getGeminiApiKey: () => string): Promise<AiAutoCommitResult> {
    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) {
      throw new Error('No repository selected.');
    }

    if (!settings.aiAutoCommitEnabled) {
      throw new Error('AI Auto-Commit ist in den Einstellungen deaktiviert.');
    }

    const model = getSelectedModel(settings);
    if (!model) {
      throw new Error('Kein KI-Modell konfiguriert.');
    }

    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }
    }

    const initialStatus = await this.gitService.getStatusPorcelain();
    const initialEntries = parseStatusPorcelain(initialStatus);

    if (initialEntries.some(entry => CONFLICT_CODES.has(entry.code))) {
      throw new Error('Repository hat Konflikte. Bitte zuerst aufloesen.');
    }

    if (initialEntries.length === 0) {
      throw new Error('Working Tree ist sauber. Keine Commits noetig.');
    }

    const commits: AiCommit[] = [];
    const tools = buildTools();
    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content: [
          'You are an autonomous git commit assistant.',
          'Goal: create a clean and logical sequence of commits from local changes.',
          'Always inspect status and diffs before committing.',
          'Only use provided tools and existing file paths.',
          'Create concise imperative commit titles.',
          'When done, call finish with a short summary.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Repository path: ${repoPath}`,
          `Provider: ${settings.aiProvider}`,
          `Model: ${model}`,
          `Current status entries: ${initialEntries.length}`,
          'Split unrelated changes into separate commits where useful.',
          'Do not push and do not rewrite history.',
        ].join('\n'),
      },
    ];

    let summary = 'AI Auto-Commit finished.';

    for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
      const assistantReply = await runProviderChat(settings, messages, tools, getGeminiApiKey);

      messages.push({
        role: 'assistant',
        content: assistantReply.content,
        toolCalls: assistantReply.toolCalls,
        rawGeminiParts: assistantReply.rawGeminiParts,
      });

      if (assistantReply.toolCalls.length === 0) {
        if (assistantReply.content.trim()) {
          summary = assistantReply.content.trim();
        }
        break;
      }

      let shouldFinish = false;
      for (const toolCall of assistantReply.toolCalls) {
        const toolResult = await this.executeTool(toolCall.name, toolCall.arguments, settings, commits);
        messages.push({ role: 'tool', content: JSON.stringify(toolResult), toolName: toolCall.name });

        if (toolCall.name === 'finish') {
          shouldFinish = true;
          if (typeof toolResult.summary === 'string' && toolResult.summary.trim()) {
            summary = toolResult.summary;
          }
        }
      }

      if (shouldFinish) {
        break;
      }
    }

    return { commits, summary, turns: messages.length };
  }

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    settings: AppSettings,
    commits: AiCommit[],
  ): Promise<Record<string, unknown>> {
    try {
      if (toolName === 'get_status') {
        const rawStatus = await this.gitService.getStatusPorcelain();
        const entries = parseStatusPorcelain(rawStatus);

        const staged = uniqueSorted(entries.filter(entry => entry.x !== ' ' && entry.x !== '?').map(entry => entry.path));
        const unstaged = uniqueSorted(entries.filter(entry => entry.y !== ' ' && entry.y !== '?').map(entry => entry.path));
        const untracked = uniqueSorted(entries.filter(entry => entry.x === '?' || entry.y === '?').map(entry => entry.path));
        const conflicts = uniqueSorted(entries.filter(entry => CONFLICT_CODES.has(entry.code)).map(entry => entry.path));

        return { ok: true, staged, unstaged, untracked, conflicts, total: entries.length };
      }

      if (toolName === 'get_diff') {
        const path = safeString(args.path).trim();
        const staged = Boolean(args.staged);
        if (!path) {
          return { ok: false, error: 'path is required' };
        }

        const rawStatus = await this.gitService.getStatusPorcelain();
        const knownPaths = new Set(parseStatusPorcelain(rawStatus).map(entry => entry.path));
        if (!knownPaths.has(path)) {
          return { ok: false, error: `Unknown path: ${path}` };
        }

        const diff = staged
          ? await this.gitService.runCommand(['diff', '--cached', '--', path])
          : await this.gitService.runCommand(['diff', '--', path]);

        return { ok: true, path, staged, diff: trimDiff(diff || '(empty diff)') };
      }

      if (toolName === 'stage_files') {
        const paths = uniqueSorted(asStringArray(args.paths).map(path => path.trim()).filter(Boolean));
        if (paths.length === 0) {
          return { ok: false, error: 'No paths provided.' };
        }

        const rawStatus = await this.gitService.getStatusPorcelain();
        const knownPaths = new Set(parseStatusPorcelain(rawStatus).map(entry => entry.path));
        const invalid = paths.filter(path => !knownPaths.has(path));
        if (invalid.length > 0) {
          return { ok: false, error: `Unknown paths: ${invalid.join(', ')}` };
        }

        for (const path of paths) {
          await this.gitService.runCommand(['add', '--', path]);
        }

        return { ok: true, staged: paths };
      }

      if (toolName === 'unstage_files') {
        const paths = uniqueSorted(asStringArray(args.paths).map(path => path.trim()).filter(Boolean));
        if (paths.length === 0) {
          return { ok: false, error: 'No paths provided.' };
        }

        for (const path of paths) {
          await this.gitService.runCommand(['reset', 'HEAD', '--', path]);
        }

        return { ok: true, unstaged: paths };
      }

      if (toolName === 'commit') {
        const title = safeString(args.title).trim();
        const description = safeString(args.description).trim();
        const signoff = typeof args.signoff === 'boolean' ? args.signoff : settings.commitSignoffByDefault;

        if (!title) {
          return { ok: false, error: 'Commit title is required.' };
        }

        const rawStatus = await this.gitService.getStatusPorcelain();
        const entries = parseStatusPorcelain(rawStatus);
        const stagedCount = entries.filter(entry => entry.x !== ' ' && entry.x !== '?').length;

        if (stagedCount === 0) {
          return { ok: false, error: 'No staged files to commit.' };
        }

        const commitArgs = ['commit'];
        if (signoff) {
          commitArgs.push('--signoff');
        }
        commitArgs.push('-m', title);
        if (description) {
          commitArgs.push('-m', description);
        }

        await this.gitService.runCommand(commitArgs);

        const hash = (await this.gitService.runCommand(['rev-parse', '--short', 'HEAD'])).trim();
        const subject = (await this.gitService.runCommand(['show', '-s', '--format=%s', 'HEAD'])).trim();
        commits.push({ hash, subject });

        return { ok: true, hash, subject };
      }

      if (toolName === 'finish') {
        return {
          ok: true,
          summary: safeString(args.summary, 'AI Auto-Commit finished.'),
          commitsCreated: commits.length,
        };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (error: unknown) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown tool execution error',
      };
    }
  }
}

export const aiService = new AiService(gitService);














