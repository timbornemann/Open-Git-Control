import type { AutoCommitContext, AutoCommitGroup } from './AutoCommitPlanTypes';
import { fallbackPlannedMessage, validatePlannedMessage, type CommitPolicy } from './AutoCommitMessagePolicy';
import { parseJsonFromText } from './jsonResponse';

export function validateAutoCommitPlan(raw: string, context: AutoCommitContext, policy: CommitPolicy): AutoCommitGroup[] {
  if (raw.length > 512 * 1024) throw new Error('Plan response exceeds its size limit.');
  const parsed = parseJsonFromText(raw);
  if (!parsed || !Array.isArray(parsed.groups) || !parsed.groups.length || parsed.groups.length > context.changes.length)
    throw new Error('Return a nonempty groups array.');
  const byId = new Map(context.changes.map((change) => [change.id, change]));
  const assignment = new Map<string, number>();
  const staged = context.changes.filter((change) => change.source === 'staged');
  const groups = parsed.groups.map((value: unknown, index: number): AutoCommitGroup => {
    if (!value || typeof value !== 'object') throw new Error('Invalid group.');
    const item = value as Record<string, unknown>;
    if (!Array.isArray(item.changeIds) || !item.changeIds.length) throw new Error('Each group must contain changeIds.');
    const ids = item.changeIds as unknown[];
    for (const id of ids) {
      if (typeof id !== 'string' || !byId.has(id)) throw new Error(`Unknown change ID: ${String(id).slice(0, 50)}`);
      if (assignment.has(id)) throw new Error(`Change assigned more than once: ${id}`);
      assignment.set(id, index);
    }
    const changeIds = ids as string[];
    const source = byId.get(changeIds[0])!.source;
    if (changeIds.some((id) => byId.get(id)!.source !== source)) throw new Error('Staged and worktree changes must be separate.');
    if (source === 'staged' && (index !== 0 || changeIds.length !== staged.length)) throw new Error('All staged changes must form exactly the first commit.');
    if (typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.length > 1000)
      throw new Error('Each group needs a short factual rationale.');
    return { id: `group-${index + 1}`, source, changeIds, ...validatePlannedMessage(item, policy), rationale: item.rationale.trim(), messageSource: 'ai' };
  });
  if (assignment.size !== byId.size)
    throw new Error(
      `Missing change IDs: ${[...byId.keys()]
        .filter((id) => !assignment.has(id))
        .slice(0, 30)
        .join(', ')}`,
    );
  for (const edge of context.relationships) {
    if (edge.strong && assignment.get(edge.from) !== assignment.get(edge.to))
      throw new Error(`Related changes ${edge.from} and ${edge.to} must stay together (${edge.reason}).`);
  }
  return groups;
}

export function fallbackAutoCommitPlan(context: AutoCommitContext, policy: CommitPolicy): AutoCommitGroup[] {
  return (['staged', 'worktree'] as const).flatMap((source) => {
    const changes = context.changes.filter((change) => change.source === source);
    if (!changes.length) return [];
    return [
      {
        id: `fallback-${source}`,
        source,
        changeIds: changes.map((change) => change.id),
        ...fallbackPlannedMessage(changes, policy),
        messageSource: 'fallback' as const,
        rationale:
          policy.aiCommitMessageLanguage === 'de'
            ? 'Gemeinsamer Ersatz-Commit nach fehlgeschlagener KI-Planung.'
            : 'Combined fallback commit after AI planning failed.',
      },
    ];
  });
}
