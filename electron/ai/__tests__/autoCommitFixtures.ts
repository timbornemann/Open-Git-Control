import type { AutoCommitContext, ChangeContext, ChangeSource } from '../AutoCommitPlanTypes';
import { DEFAULT_SETTINGS } from '../../settings';

export const policy = { ...DEFAULT_SETTINGS, aiAutoCommitEnabled: true, aiProvider: 'gemini' as const };
export const change = (id: string, file = `area/${id}.ts`, source: ChangeSource = 'worktree'): ChangeContext => ({
  id,
  path: file,
  source,
  oldBlob: 'a'.repeat(40),
  newBlob: 'b'.repeat(40),
  oldMode: '100644',
  newMode: '100644',
  status: 'M',
  additions: 300,
  deletions: 200,
  binary: false,
  hunks: [`@@ changed code @@\n+export const ${id} = true;`],
  symbols: [id],
  references: [],
  imports: [],
});
export const contextFor = (...changes: ChangeContext[]): AutoCommitContext => ({ changes, relationships: [], relatedCode: [] });
export const responseFor = (groups: string[][]) =>
  JSON.stringify({
    groups: groups.map((changeIds) => ({
      changeIds,
      title: 'fix: preserve the complete change',
      description: 'Updates the captured behavior.',
      rationale: 'One complete feature.',
    })),
  });
