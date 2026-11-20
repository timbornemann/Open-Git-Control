import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchHeadProblem } from '@/shared/ipc/branchRecovery';
import { useI18n, type TranslateFn } from '@/i18n';
import './branchRecovery.css';

export function branchProblemLabel(reason: BranchHeadProblem['reason'], tr: TranslateFn): string {
  switch (reason) {
    case 'broken-ref':
      return tr('Branch-Verweis beschädigt', 'Branch reference damaged');
    case 'missing-ref':
      return tr('Branch-Verweis fehlt', 'Branch reference missing');
    case 'missing-commit':
      return tr('Commit-Objekt fehlt', 'Commit object missing');
    case 'unverifiable':
      return tr('Branchzustand konnte nicht geprüft werden', 'Could not verify branch state');
  }
}

export function BranchHeadNotice({ problem, onOpen }: { problem: BranchHeadProblem; onOpen?: () => void }) {
  const { tr } = useI18n();
  return (
    <section className="branch-head-notice" role="alert">
      <AlertTriangle size={17} aria-hidden="true" />
      <div>
        <strong>{branchProblemLabel(problem.reason, tr)}</strong>
        {problem.ref && <code>{problem.ref}</code>}
        {problem.targetOid && <code>{problem.targetOid}</code>}
        {problem.detail && <small>{problem.detail}</small>}
        {onOpen && (
          <Button size="sm" onClick={onOpen}>
            {tr('Wiederherstellung prüfen', 'Review recovery')}
          </Button>
        )}
      </div>
    </section>
  );
}
