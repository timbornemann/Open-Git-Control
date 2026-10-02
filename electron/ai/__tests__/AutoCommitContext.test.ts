import { describe, expect, it } from 'vitest';
import { AutoCommitImportResolver } from '../AutoCommitImportResolver';
import type { AutoCommitObjectReader } from '../AutoCommitObjectReader';
import { buildRelationships } from '../AutoCommitRelationships';
import { DiffHunkSampler } from '../AutoCommitContextBuilder';
import { redactAiContext } from '../../SecretScanService';
import { change } from './autoCommitFixtures';

async function resolverFor(content: Record<string, string>) {
  const reader = {
    files: new Map(Object.keys(content).map((file) => [file, file])),
    load: async () => {},
    read: (file: string) => content[file] || '',
  } as unknown as AutoCommitObjectReader;
  const resolver = new AutoCommitImportResolver(reader);
  await resolver.initialize();
  return resolver;
}

describe('cross-folder change context', () => {
  it('resolves relative ESM imports, inherited path aliases and local package exports', async () => {
    const resolver = await resolverFor({
      'configs/tsconfig.base.json': '{"compilerOptions":{"baseUrl":"..","paths":{"@api/*":["packages/api/src/*"]}}}',
      'apps/desktop/tsconfig.json': '{"extends":"../../configs/tsconfig.base.json"}',
      'packages/api/package.json': '{"name":"@workspace/api","exports":{".":{"import":"./src/index.ts"},"./*":"./src/*.ts"}}',
      'packages/api/src/index.ts': '',
      'packages/api/src/contracts.ts': '',
      'apps/desktop/helper.ts': '',
    });
    expect(resolver.resolve('apps/desktop/main.ts', './helper.js')).toBe('apps/desktop/helper.ts');
    expect(resolver.resolve('apps/desktop/main.ts', '@api/contracts')).toBe('packages/api/src/contracts.ts');
    expect(resolver.resolve('apps/desktop/main.ts', '@workspace/api')).toBe('packages/api/src/index.ts');
    expect(resolver.resolve('apps/desktop/main.ts', '@workspace/api/contracts')).toBe('packages/api/src/contracts.ts');
    expect(resolver.resolve('apps/desktop/main.ts', '../../../private.ts')).toBeUndefined();
  });

  it('connects implementation, contracts, tests and lockfiles without grouping unrelated neighbours', async () => {
    const files = [
      { ...change('w1', 'packages/api/contracts.ts'), symbols: ['SessionResult'] },
      { ...change('w2', 'apps/desktop/session.ts'), references: ['SessionResult'] },
      change('w3', 'specs/session.test.ts'),
      change('w4', 'apps/desktop/unrelated.ts'),
      change('w5', 'package.json'),
      change('w6', 'package-lock.json'),
      { ...change('s1', 'staged.ts', 'staged'), references: ['SessionResult'] },
    ];
    const edges = buildRelationships(files, await resolverFor({}));
    const linked = (a: string, b: string) => edges.some((edge) => [edge.from, edge.to].includes(a) && [edge.from, edge.to].includes(b) && edge.strong);
    expect(linked('w1', 'w2')).toBe(true);
    expect(linked('w2', 'w3')).toBe(true);
    expect(linked('w5', 'w6')).toBe(true);
    expect(edges.some((edge) => [edge.from, edge.to].some((id) => ['w4', 's1'].includes(id)))).toBe(false);
  });

  it('samples beyond the beginning of large diffs and redacts recognized context secrets', () => {
    const sampler = new DiffHunkSampler();
    for (let index = 0; index < 200; index += 1) sampler.add(`hunk ${index}`);
    expect(sampler.result()).toHaveLength(8);
    expect(sampler.result().some((hunk) => Number(hunk.slice(5)) > 100)).toBe(true);
    const secret = `sk-proj-${'x'.repeat(40)}`;
    expect(redactAiContext(`const apiKey = '${secret}';`)).not.toContain(secret);
    expect(redactAiContext("import { SessionResult } from '@api/contracts';")).toContain('@api/contracts');
  });
});
