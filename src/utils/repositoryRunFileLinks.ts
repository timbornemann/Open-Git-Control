import type { EditorPosition } from '@/types/editor';
import { normalizeRepoPathKey } from './repoPath';

export type RepositoryRunFileTarget = { path: string } & Partial<EditorPosition>;
export type RepositoryRunFileReference = { start: number; end: number; text: string; target: RepositoryRunFileTarget };

const isAbsolute = (path: string) => /^(?:[a-z]:\/|\/)/i.test(path);
const fileName = /(?:\.[a-z][a-z0-9_-]*|(?:^|\/)(?:Dockerfile|Makefile|LICENSE|README))$/i;
const standaloneFileName =
  /(?:\.(?:[cm]?[jt]sx?|css|scss|sass|less|jsonc?|ya?ml|toml|lock|xml|html?|md|markdown|txt|rs|go|py|java|c|cc|cpp|cxx|h|hpp|cs|sh|ps1|bat|cmd|vue|svelte|sql)|^(?:\.env(?:\..+)?|\.gitignore|\.npmrc|\.prettierrc|Dockerfile|Makefile|LICENSE|README))$/i;

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/').replace(/\/+$/, '');
}

/** Resolve against the run's actual working directory, never against the selected UI repository. */
export function resolveRepositoryRunFile(repoPath: string, file: string, position: Partial<EditorPosition> = {}): RepositoryRunFileTarget | null {
  let path = file;
  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.username || url.password || url.search || url.hash) return null;
      path = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== 'localhost') path = '//' + url.hostname + path;
      else if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    } catch {
      return null;
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return null;
  // Reject control bytes, glob patterns and Windows drive-relative paths.
  // eslint-disable-next-line no-control-regex -- File references must not contain control characters.
  if (/[\u0000-\u001f\u007f*?]/.test(path) || /^[a-z]:[^\\/]/i.test(path)) return null;
  const root = normalizePath(repoPath);
  if (!root || !isAbsolute(root)) return null;
  const absolute = normalizePath(isAbsolute(path.replace(/\\/g, '/')) ? path : root + '/' + path);
  const rootKey = normalizeRepoPathKey(root);
  const absoluteKey = normalizeRepoPathKey(absolute);
  if (!absoluteKey.startsWith(rootKey + '/')) return null;
  const relative = absolute.slice(root.length + 1);
  if (!relative || relative.split('/').includes('..')) return null;
  return {
    path: relative,
    ...(Number.isSafeInteger(position.line) && position.line! > 0 ? { line: position.line } : {}),
    ...(Number.isSafeInteger(position.column) && position.column! > 0 ? { column: position.column } : {}),
  };
}

function splitLocation(value: string): { file: string; position: Partial<EditorPosition> } {
  const location = value.match(/^(.*?)(?::(\d+)(?::(\d+))?|\((\d+),\s*(\d+)\))$/);
  if (!location) return { file: value, position: {} };
  return { file: location[1], position: { line: Number(location[2] ?? location[4]), column: Number(location[3] ?? location[5]) || undefined } };
}

/** Recognize local source references without turning URLs, shell commands or terminal links into actions. */
export function findRepositoryRunFileReferences(text: string, repoPath: string): RepositoryRunFileReference[] {
  const references: RepositoryRunFileReference[] = [];
  const claimed: Array<{ start: number; end: number }> = [];
  const add = (start: number, value: string, explicitPosition?: Partial<EditorPosition>) => {
    const { file, position } = splitLocation(value);
    if (!fileName.test(file.replace(/\\/g, '/'))) return;
    if (!/[\\/]/.test(file) && !position.line && !explicitPosition?.line && !standaloneFileName.test(file)) return;
    const end = start + value.length;
    if (claimed.some((item) => start < item.end && end > item.start)) return;
    claimed.push({ start, end });
    const target = resolveRepositoryRunFile(repoPath, file, explicitPosition ?? position);
    if (!target) return;
    references.push({ start, end, text: value, target });
  };
  // Quoted paths can contain spaces; Python provides the position outside the quotes.
  for (const match of text.matchAll(/(["'\x60])([^"'\x60\r\n]+)\1(?:,\s*line\s+(\d+))?/g)) {
    add(match.index! + 1, match[2], match[3] ? { line: Number(match[3]) } : undefined);
  }
  for (const match of text.matchAll(/file:\/\/[^\s"'<>|\x60)]+/gi)) add(match.index!, match[0]);
  // Windows paths may contain spaces without quoting.
  for (const match of text.matchAll(/[a-z]:[\\/][^"'\x60<>\r\n|?*]*?\.[a-z0-9_-]+(?::\d+(?::\d+)?|\(\d+,\s*\d+\))?(?=$|[\s"'(),\x60])/gi)) {
    add(match.index!, match[0]);
  }
  for (const match of text.matchAll(/\/[^"'\x60<>()\r\n|?*]*?\.[a-z0-9_-]+(?::\d+(?::\d+)?)?(?=$|[\s"'(),\x60])/gi)) {
    if (!match.index || /[\s"'(\x60>]/.test(text[match.index - 1])) add(match.index!, match[0]);
  }
  // Compiler diagnostics often begin with a relative path containing spaces.
  const diagnostic = text.match(/^(\s*(?:(?:[×✗❯]|-->)\s+)?)(.+?\.[a-z0-9_-]+(?::\d+(?::\d+)?|\(\d+,\s*\d+\)))(?=\s*:?\s*(?:error|warning|fatal)\b|$)/i);
  if (diagnostic && !/[():]/.test(diagnostic[2].replace(/^[a-z]:/i, '').split(/:\d|\(\d/)[0])) add(diagnostic[1].length, diagnostic[2]);
  const pathLine = text.trim();
  if (/^(?:\.{1,2}[\\/]|[^\s"'()\x60:]+[\\/])/.test(pathLine) && fileName.test(pathLine)) add(text.indexOf(pathLine), pathLine);
  for (const match of text.matchAll(/[^\s"'()\x60{}\[\]<>|:]+(?::\d+(?::\d+)?|\(\d+,\s*\d+\))?/g)) {
    const start = match.index!;
    if (start && !/[\s"'(\x60>]/.test(text[start - 1])) continue;
    add(start, match[0].replace(/[.,;]+$/, ''));
  }
  return references.sort((left, right) => left.start - right.start);
}
