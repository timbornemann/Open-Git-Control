import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { AnalyticsIdentity } from '../../src/shared/ipc/repositoryAnalytics';
import type { CommitRecord, TreeEntry } from './AnalyticsTypes';

export const identity = (name: string, email: string, raw = false): AnalyticsIdentity => ({
  id: createHash('sha256')
    .update(raw ? `${name}\0${email}` : email || `name:${name}`)
    .digest('hex')
    .slice(0, 24),
  name,
  email,
});
export const LOG_FORMAT = '%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00';

/** Consume paths according to Git's grammar, never by splitting lines or a marker inside a pathname. */
export class AnalyticsLogParser {
  private decoder = new StringDecoder('utf8');
  private pending = '';
  private tokens: string[] = [];
  private record: CommitRecord | null = null;
  constructor(private readonly onCommit: (record: CommitRecord) => void) {}
  write(chunk: Buffer): void {
    this.pending += this.decoder.write(chunk);
    const end = this.pending.lastIndexOf('\0');
    if (end < 0) return;
    this.tokens.push(...this.pending.slice(0, end).split('\0'));
    this.pending = this.pending.slice(end + 1);
    this.consume(false);
  }
  finish(): void {
    this.pending += this.decoder.end();
    if (this.pending.trim()) throw new Error('Incomplete analytics Git record.');
    this.consume(true);
    if (this.tokens.some((token) => token.trim())) throw new Error('Incomplete analytics pathname.');
    this.publish();
  }
  private publish() {
    if (this.record) this.onCommit(this.record);
    this.record = null;
  }
  private consume(final: boolean): void {
    let index = 0;
    while (index < this.tokens.length) {
      const token = this.tokens[index].replace(/^[\r\n]+/, '');
      const header = token.startsWith('\x1e') ? /^([0-9a-f]{40,64})$/.exec(token.slice(1)) : null;
      if (header) {
        if (index + 5 >= this.tokens.length) break;
        this.publish();
        const [parents, name, email, date, subject] = this.tokens.slice(index + 1, index + 6);
        this.record = {
          hash: header[1],
          parents: parents.split(' ').filter(Boolean),
          author: identity(name, email, true),
          date: Number(date) * 1000,
          subject,
          changes: [],
        };
        index += 6;
        continue;
      }
      const raw = /^:(\d{6}) (\d{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([A-Z])\d*$/.exec(token);
      if (raw) {
        const rename = raw[5] === 'R' || raw[5] === 'C';
        if (index + (rename ? 2 : 1) >= this.tokens.length) break;
        const first = this.tokens[index + 1];
        this.record?.changes.push({
          path: rename ? this.tokens[index + 2] : first,
          ...(rename ? { oldPath: first } : {}),
          before: raw[3],
          after: raw[4],
          mode: raw[2] === '000000' ? raw[1] : raw[2],
          status: raw[5],
          additions: 0,
          deletions: 0,
          binary: false,
        });
        index += rename ? 3 : 2;
        continue;
      }
      const stat = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token);
      if (stat) {
        if (!stat[3] && index + 2 >= this.tokens.length) break;
        const path = stat[3] || this.tokens[index + 2];
        const change = this.record?.changes.find((entry) => entry.path === path);
        if (change) {
          change.additions = stat[1] === '-' ? 0 : Number(stat[1]);
          change.deletions = stat[2] === '-' ? 0 : Number(stat[2]);
          change.binary = stat[1] === '-';
        }
        index += stat[3] ? 1 : 3;
        continue;
      }
      if (token.trim() && final) throw new Error('Unrecognized analytics Git record.');
      if (token.trim()) break;
      index++;
    }
    this.tokens = this.tokens.slice(index);
  }
}

export function parseTree(raw: string): TreeEntry[] {
  return raw.split('\0').flatMap((record) => {
    const match = /^(\d{6}) (?:blob|commit) ([0-9a-f]{40,64})\s+([\d-]+)\t([\s\S]+)$/.exec(record);
    return match ? [{ mode: match[1], oid: match[2], size: Number(match[3]) || 0, path: match[4] }] : [];
  });
}
export function languageFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languages: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    mjs: 'JavaScript',
    py: 'Python',
    rs: 'Rust',
    go: 'Go',
    java: 'Java',
    cs: 'C#',
    c: 'C',
    h: 'C / C++',
    cpp: 'C++',
    hpp: 'C++',
    rb: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kt: 'Kotlin',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    vue: 'Vue',
    svelte: 'Svelte',
    md: 'Markdown',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    toml: 'TOML',
    xml: 'XML',
    sh: 'Shell',
    ps1: 'PowerShell',
    sql: 'SQL',
    txt: 'Text',
    csv: 'CSV',
    lock: 'Lockfile',
  };
  return languages[ext] || (ext && ext !== path ? `.${ext}` : 'Text');
}
