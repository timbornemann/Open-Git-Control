import type { DemoRepository } from './demoRepository';
import { DEMO_TIME } from './demoRepository';
import { demoAncestors } from './demoHistory';
export type DemoReflogEntry = { hash: string; subject: string; date: string };
/** Stored objects and recorded HEAD movements are separate from normal graph roots. */
export function seedDemoReflog(repo: DemoRepository) {
  repo.reflog = demoAncestors(repo).map((commit) => ({ hash: commit.hash, subject: 'commit: ' + commit.subject, date: commit.date }));
}
export function recordDemoHead(repo: DemoRepository, subject: string, hash = repo.commits[0]?.hash) {
  if (!hash || !repo.commits.some((commit) => commit.hash === hash)) throw new Error('A recovery point must name a stored practice commit.');
  repo.reflog.unshift({ hash, subject, date: new Date(DEMO_TIME + repo.revision + 1).toISOString() });
}
export function demoReflog(repo: DemoRepository, args: readonly string[]) {
  const requested = args[0] === undefined ? 300 : Number(args[0]);
  if (args.length > 1 || !Number.isFinite(requested)) return { success: false as const, error: 'Choose a supported practice history limit.' };
  const limit = Math.max(1, Math.min(1000, Math.floor(requested)));
  return {
    success: true as const,
    data: repo.reflog
      .slice(0, limit)
      .map((entry, index) => [entry.hash, entry.hash.slice(0, 7), 'HEAD@{' + index + '}', entry.subject, entry.date].join('\x1f') + '\0')
      .join(''),
  };
}
