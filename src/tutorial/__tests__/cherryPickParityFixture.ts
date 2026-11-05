import * as fs from 'node:fs';
import * as path from 'node:path';
import { rewordParityFixture } from './rewordParityFixture';
import { prepareDemoMergeFixture } from '../demoMergeFixture';
import { resolveDemoCommit } from '../demoHistory';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { demoBlobBytes } from '../demoBlob';

export function cherryPickParityFixture(language: 'de' | 'en', divergence: 'diverged-readme' | 'diverged-license' = 'diverged-readme') {
  const fixture = rewordParityFixture(language);
  const { repo, git, revisions, cwd } = fixture;
  prepareDemoMergeFixture(repo, divergence, language);
  const source = resolveDemoCommit(repo, hash(5))!;
  git(['checkout', '-B', 'feature/begruessung', revisions.get(hash(3))!]);
  for (const [name, blob] of Object.entries(source.files!)) {
    fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    fs.writeFileSync(path.join(cwd, name), demoBlobBytes(blob));
  }
  git(['add', '-A']);
  git(['commit', '-m', source.subject, '-m', source.body || ''], {
    GIT_AUTHOR_NAME: source.author!,
    GIT_AUTHOR_EMAIL: source.email!,
    GIT_AUTHOR_DATE: source.date,
    GIT_COMMITTER_DATE: source.date,
  });
  const sourceHash = git(['rev-parse', 'HEAD']).trim();
  revisions.set(hash(5), sourceHash);
  git(['checkout', 'main']);
  repo.branchHeads.set('feature/begruessung', hash(5));
  return { ...fixture, source, sourceHash };
}
