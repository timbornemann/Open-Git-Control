import type { PatchApplyOptionsDto } from '@/shared/ipc/contracts/git';
import type { ApplyDiffLineSelectionRequest, ApplyDiffLineSelectionResult } from '@/shared/ipc/diffLineSelection';
import { DIFF_SELECTION_MAX_BYTES, DIFF_SELECTION_MAX_LINES } from '@/shared/ipc/diffLineSelection';
import { parseDiff, parseHunkRange } from '@/shared/diff/parser';
import { diffSelectionBlockReason } from '@/shared/diff/lineSelection';
import { buildSelectedDiffPatch, DiffLineEndingDependency } from '@/shared/diff/selectedPatch';
import type { IpcResult } from '@/types/ipc';
import type { DemoRepository } from './demoRepository';
import { demoTextLines, sameDemoLine, type DemoTextLine } from './demoDiff';
import { refreshDemoFiles } from './demoFiles';
import { demoGitText, readDemoBlob, type DemoFiles, type DemoBlob } from './demoBlob';

const owns = (files: DemoFiles, path: string) => Object.prototype.hasOwnProperty.call(files, path);
const fail = () => ({ success: false as const, error: 'Der Übungs-Patch passt nicht zum aktuellen Stand. / Practice patch does not apply.' });
function pathFromHeader(header: string) {
  if (header === '/dev/null') return null;
  let path = header;
  if (path.startsWith('"')) {
    if (!path.endsWith('"')) throw new Error('Invalid quoted path.');
    path = path
      .slice(1, -1)
      .replace(/\\([0-7]{1,3}|[abtnvfr"\\])/g, (_match, code: string) =>
        /^[0-7]/.test(code)
          ? String.fromCharCode(Number.parseInt(code, 8))
          : { a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', '"': '"', '\\': '\\' }[code]!,
      );
  }
  if (!/^[ab]\//.test(path) || !path.slice(2) || path.includes('\0')) throw new Error('Invalid practice patch path.');
  return path.slice(2);
}
function patchText(blob?: DemoBlob) {
  if (blob !== undefined && !['utf8', 'utf8-bom'].includes(readDemoBlob(blob).encoding)) throw new Error('This practice patch requires UTF-8.');
  return demoTextLines(demoGitText(blob));
}
function patchFile(patch: string, original: DemoFiles, reverse: boolean) {
  const parsed = parseDiff(patch);
  if (diffSelectionBlockReason(parsed, patch)) throw new Error('Unsupported practice patch.');
  const from = pathFromHeader(parsed.fileHeader.find((line) => line.startsWith('--- '))?.slice(4) || '');
  const to = pathFromHeader(parsed.fileHeader.find((line) => line.startsWith('+++ '))?.slice(4) || '');
  if ((!from && !to) || (from && to && from !== to)) throw new Error('Unsupported practice rename.');
  const path = from || to!;
  const before = reverse ? to : from,
    after = reverse ? from : to;
  if (Boolean(before) !== owns(original, path)) throw new Error('File existence changed.');
  const input = patchText(original[path]);
  const output: DemoTextLine[] = [];
  let cursor = 0;
  for (const hunk of parsed.hunks) {
    const range = parseHunkRange(hunk.header)!;
    const start = reverse ? range.rightStart : range.leftStart;
    const count = reverse ? range.rightCount : range.leftCount;
    const position = start - (count ? 1 : 0);
    if (position < cursor || position > input.length) throw new Error('Hunk position changed.');
    const expected: DemoTextLine[] = [],
      replacement: DemoTextLine[] = [];
    for (let index = 0; index < hunk.rawLines.length; index++) {
      const raw = hunk.rawLines[index];
      if (raw === '\\ No newline at end of file') continue;
      if (!/^[ +\-]/.test(raw)) throw new Error('Invalid hunk line.');
      const token = { text: raw.slice(1), newline: hunk.rawLines[index + 1] !== '\\ No newline at end of file' };
      const kind = reverse ? (raw[0] === '+' ? '-' : raw[0] === '-' ? '+' : ' ') : raw[0];
      if (kind !== '+') expected.push(token);
      if (kind !== '-') replacement.push(token);
    }
    if (expected.length !== count || expected.some((line, index) => !input[position + index] || !sameDemoLine(line, input[position + index])))
      throw new Error('Hunk context changed.');
    output.push(...input.slice(cursor, position), ...replacement);
    cursor = position + count;
  }
  output.push(...input.slice(cursor));
  if (output.slice(0, -1).some((line) => !line.newline) || (!after && output.length)) throw new Error('Invalid final line.');
  return { path, content: after ? output.map((line) => line.text + (line.newline ? '\n' : '')).join('') : undefined };
}

/** Apply prepared text patches atomically to the private worktree or index. */
export function applyDemoPatch(repo: DemoRepository, patch: string, options: PatchApplyOptionsDto = {}, repoPath = repo.activeRepo): IpcResult<string> {
  if (repoPath !== repo.activeRepo || repo.conflicted || patch.includes('\0') || new TextEncoder().encode(patch).byteLength > DIFF_SELECTION_MAX_BYTES)
    return fail();
  try {
    const chunks = patch.split(/(?=^diff --git )/m).filter((part) => part.trim());
    if (!chunks.length || chunks.some((part) => !part.startsWith('diff --git '))) return fail();
    const files = { ...(options.cached ? repo.indexFiles : repo.files) };
    for (const chunk of chunks) {
      const result = patchFile(chunk, files, !!options.reverse);
      if (result.content === undefined) delete files[result.path];
      else Object.defineProperty(files, result.path, { value: result.content, enumerable: true, writable: true, configurable: true });
    }
    if (options.cached) repo.indexFiles = files;
    else repo.files = files;
    refreshDemoFiles(repo);
    repo.mark(options.cached ? (options.reverse ? 'unstaged' : 'staged') : options.reverse ? 'discarded' : 'file-saved');
    repo.emitChannel('tree', repo.activeRepo);
    return { success: true, data: '' };
  } catch {
    return fail();
  }
}

export function applyDemoLineSelection(repo: DemoRepository, request: ApplyDiffLineSelectionRequest): IpcResult<ApplyDiffLineSelectionResult> {
  if (request.repoPath !== repo.activeRepo) return fail();
  if (repo.conflicted) return { success: true, data: { status: 'unsupported', reason: 'conflict' } };
  const current = repo.diff(request.path, request.source === 'staged');
  if (request.expectedDiff !== current) return { success: true, data: { status: 'stale' } };
  if (new TextEncoder().encode(current).byteLength > DIFF_SELECTION_MAX_BYTES || current.split('\n').length > DIFF_SELECTION_MAX_LINES)
    return { success: true, data: { status: 'unsupported', reason: 'unsupported' } };
  const parsed = parseDiff(current),
    reason = diffSelectionBlockReason(parsed, current);
  if (reason) return { success: true, data: { status: 'unsupported', reason } };
  try {
    const patch = buildSelectedDiffPatch(parsed, request.selectedUnitIds, request.source, {
      path: request.path,
      mode: '100644',
      exists: owns(repo.indexFiles, request.path),
    });
    const result = applyDemoPatch(repo, patch, { cached: true }, request.repoPath);
    return result.success ? { success: true, data: { status: 'applied' } } : result;
  } catch (error) {
    return error instanceof DiffLineEndingDependency ? { success: true, data: { status: 'unsupported', reason: 'lineEndingDependency' } } : fail();
  }
}
