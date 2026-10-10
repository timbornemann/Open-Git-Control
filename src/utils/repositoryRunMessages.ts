import type { RepositoryRunOutputLineDto } from '@/types/repositoryRun';
import { normalizeTerminalText, TerminalTextSanitizer } from '@/shared/terminalText';

export type RunMessageKind = 'message' | 'system' | 'command' | 'info' | 'success' | 'warning' | 'error' | 'watch' | 'progress' | 'detail' | 'cascade';
export type RunMessageHint = 'port-in-use' | 'engine-mismatch' | 'missing-command' | 'missing-dependency';
export type RunMessage = { text: string; kind: RunMessageKind; tool?: string; scope?: string; hint?: RunMessageHint; knownProblem: boolean };

export function cleanRepositoryRunLines(lines: RepositoryRunOutputLineDto[]): RepositoryRunOutputLineDto[] {
  const sanitizers = new Map<string, TerminalTextSanitizer>();
  return lines.map((line) => {
    const key = `${line.stepIndex}:${line.stream}`;
    const sanitizer = sanitizers.get(key) ?? new TerminalTextSanitizer();
    sanitizers.set(key, sanitizer);
    const text = normalizeTerminalText(sanitizer.write(`${line.text}\n`)).replace(/\n$/, '');
    return text === line.text ? line : { ...line, text };
  });
}

export function classifyRunMessage(line: RepositoryRunOutputLineDto): RunMessage {
  let text = line.text.trim();
  let scope: string | undefined;
  const workspace = text.match(/^(.+?)\s+\|\s*(.+)$/);
  if (workspace && /^(?:\[?(?:WARN|ERROR|ELIFECYCLE)|ERR_PNPM)/.test(workspace[2])) {
    scope = workspace[1];
    text = workspace[2];
  }
  const tool = /^Running (?:BeforeDev|Dev)Command\b/.test(text)
    ? 'Tauri'
    : /\b(?:pnpm|ELIFECYCLE)\b|ERR_PNPM_/i.test(text) || scope
      ? 'pnpm'
      : /^npm\b/i.test(text)
        ? 'npm'
        : /^(?:yarn\b|YN\d{4}:|➤\s*YN\d{4}:)/i.test(text)
          ? 'Yarn'
          : /\bvite\b/i.test(text) || /error when starting dev server/i.test(text)
            ? 'Vite'
            : /\btauri\b|(?:BeforeDev|Dev)Command|beforeDevCommand/.test(text)
              ? 'Tauri'
              : /^(?:Compiling|Checking|Downloading|Downloaded|Finished)\b|^error\[E\d+\]/.test(text) || /\bcargo\b/.test(text)
                ? 'Cargo'
                : /\bTS\d{4}\b/.test(text)
                  ? 'TypeScript'
                  : /\b(?:vitest|jest)\b/i.test(text)
                    ? 'Tests'
                    : undefined;
  let hint: RunMessageHint | undefined;
  if (/\b(?:port\s+\d+.*(?:already in use|occupied)|EADDRINUSE)\b/i.test(text)) hint = 'port-in-use';
  else if (/Unsupported engine|EBADENGINE|The engine "node" is incompatible/i.test(text)) hint = 'engine-mismatch';
  else if (/command not found|is not recognized as|CommandNotFoundException|spawn .+ ENOENT|Could not find.+(?:command|executable)/i.test(text))
    hint = 'missing-command';
  else if (/Cannot find module|Module not found|ERR_MODULE_NOT_FOUND|Could not resolve ["']/.test(text)) hint = 'missing-dependency';

  let kind: RunMessageKind = 'message';
  let knownProblem = !!hint || /^(?:[A-Z]\w*Error|Error):/.test(text);
  if (line.stream === 'system') kind = 'system';
  else if (hint === 'engine-mismatch') kind = 'warning';
  else if (hint) kind = 'error';
  else if (
    /ELIFECYCLE|ERR_PNPM_(?:RECURSIVE_RUN_FIRST_FAIL|RECURSIVE_EXEC_FIRST_FAIL)|^Exit status \d+|beforeDevCommand.*non-zero|^npm (?:ERR!|error) (?:command failed|command |code ELIFECYCLE|A complete log)/i.test(
      text,
    )
  ) {
    kind = 'cascade';
    knownProblem = true;
  } else if (/^(?:npm (?:WARN|warn)\b|\[WARN(?:ING)?\]|WARN(?:ING)?\b|warning(?:\[|:)|➤\s*YN\d{4}:.*\bwarning\b)/i.test(text)) {
    kind = 'warning';
    knownProblem = /^npm\b|^\[WARN/.test(text);
  } else if (/^(?:npm (?:ERR!|error)\b|\[ERROR\]|ERR_PNPM_\w+|error\[E\d+\])/.test(text)) {
    kind = 'error';
    knownProblem = true;
  } else if (/^(?:\$\s|>\s)/.test(text)) kind = 'command';
  else if (/^(?:Info\s+)?Watching\s.+(?:for changes|\.\.\.)/i.test(text)) kind = 'watch';
  else if (/^(?:at\s+|-->\s+|Caused by:|\.\.\.)|^(?:[A-Za-z]:[\\/]|\/).+:$/.test(text)) kind = 'detail';
  else if (/^(?:error\b|fatal\b|FAIL\b|[A-Z]\w*Error:|[×✗]\s)/i.test(text)) kind = 'error';
  else if (/^(?:✓|✔|PASS\b|Finished\b|Done in\b|.*built in \d)/.test(text)) kind = 'success';
  else if (
    /^(?:Progress:|Resolving\b|Resolved\b|Downloading\b|Downloaded\b|Installing\b|Fetching\b|Compiling\b|Checking\b|Bundling\b|Building\b|Packages:)/.test(text)
  )
    kind = 'progress';
  else if (/^(?:Info\b|INFO\b|Running\b|Local:|Network:|VITE\b|\[info\])/i.test(text)) kind = 'info';
  return { text, kind, tool: tool ?? (hint === 'engine-mismatch' ? 'Node.js' : undefined), scope, hint, knownProblem };
}

/** Nested commands (for example pnpm → Tauri → Vite) establish the context of unprefixed messages. */
export function interpretRunMessages(lines: RepositoryRunOutputLineDto[]): Array<{ line: RepositoryRunOutputLineDto; message: RunMessage }> {
  const commands = new Map<number, string>();
  return lines.map((line) => {
    const message = classifyRunMessage(line);
    if (message.kind === 'command' && message.tool) commands.set(line.stepIndex, message.tool);
    if (!message.tool && message.kind !== 'system') message.tool = commands.get(line.stepIndex);
    return { line, message };
  });
}
