import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi } from 'vitest';
import { GitLfsService } from '../GitLfsService';
import type { GitRunner } from '../GitRunner';
import type { LfsReader } from '../GitLfsInspection';
import type { GitLfsFileRequest } from '../../../src/shared/ipc/gitLfs';

/** Real file metadata, deterministic Git objects and instrumented process boundaries. */
export function lfsStatusFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-status-')));
  const gitDir = path.join(root, '.git');
  fs.mkdirSync(gitDir);
  const index = path.join(gitDir, 'index');
  fs.writeFileSync(index, 'index-0');
  const objects = new Map<string, { bytes: number; sample: Buffer }>();
  const entries = new Map<string, string>();
  const working = new Map<string, string>(),
    cached = new Map<string, string>();
  let serial = 0,
    generation = 0;
  const context = { head: 'a'.repeat(40), branch: 'refs/heads/main', config: '', replacements: '' };
  const blob = (sample: Buffer | string, bytes?: number) => {
    const data = Buffer.isBuffer(sample) ? sample : Buffer.from(sample);
    const oid = (++serial).toString(16).padStart(40, '0');
    objects.set(oid, { bytes: bytes ?? data.length, sample: bytes && bytes >= 10 * 1024 * 1024 && data.length < 65536 ? Buffer.alloc(65536, data) : data });
    return oid;
  };
  const stage = (name: string, oid: string) => {
    entries.set(name, `H 100644 ${oid} 0\t${name}\0`);
    fs.writeFileSync(index, `index-${++generation}`);
  };
  const run = vi.fn<LfsReader['run']>(async (_cwd, args) => {
    if (args[0] === 'ls-files') return [...entries.values()].join('');
    if (args.includes('--git-path')) return index;
    if (args[0] === 'symbolic-ref') return context.branch;
    if (args[0] === 'rev-parse') return context.head;
    if (args[0] === 'config') return context.config;
    if (args[0] === 'for-each-ref') return context.replacements;
    return '';
  });
  const input = vi.fn<LfsReader['input']>(async (_cwd, args, value) => {
    if (args[0] === 'check-attr') {
      const attributes = args.includes('--cached') ? cached : working;
      return String(value)
        .split('\0')
        .filter(Boolean)
        .map((name) => `${name}\0filter\0${attributes.get(name) ?? 'unspecified'}\0`)
        .join('');
    }
    return String(value)
      .trim()
      .split('\n')
      .map((oid) => (objects.has(oid) ? `${oid} blob ${objects.get(oid)!.bytes}\n` : `${oid} missing\n`))
      .join('');
  });
  const prefix = vi.fn<LfsReader['prefix']>(async (_cwd, args, _max, value) => {
    if (args[1] === 'blob') return objects.get(args[2])!.sample;
    return Buffer.concat(
      String(value)
        .trim()
        .split('\n')
        .flatMap((oid) => {
          const entry = objects.get(oid)!;
          return [Buffer.from(`${oid} blob ${entry.bytes}\n`), entry.sample, Buffer.from('\n')];
        }),
    );
  });
  const reader = { run, input, prefix };
  const runner = {
    run,
    runWithInput: input,
    runBuffer: (_cwd: string, args: string[], options: { maxBytes: number; input?: string }) => prefix(_cwd, args, options.maxBytes, options.input),
    withExclusiveWrite: async (_cwd: string, _name: string, action: (git: LfsReader) => Promise<unknown>) => action(reader),
  } as unknown as GitRunner;
  const service = new GitLfsService(runner);
  const status = (files: GitLfsFileRequest[]) => service.getStatus({ repoPath: root, files });
  const write = (name: string, data: string | Buffer) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    return target;
  };
  const cleanup = () => {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('ogc-lfs-status-')) throw new Error('Unsafe fixture path.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  };
  return { root, gitDir, index, reader, service, status, stage, blob, objects, entries, working, cached, context, write, cleanup };
}
