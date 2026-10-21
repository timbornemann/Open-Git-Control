import { useState, type RefObject } from 'react';
import { HostingCreateChangeRequest } from '@/components/hosting/HostingCreateChangeRequest';
import { useI18n } from '@/i18n';
import type { HostedRepository } from '@/types/hostingDtos';
import type { PlannerBranchReference, PlannerItem } from '@/types/projectPlanner';

export function PlannerWorkCreatePr({
  item,
  branch,
  repository,
  headingRef,
  onCreated,
}: {
  item: PlannerItem;
  branch: PlannerBranchReference;
  repository: HostedRepository;
  headingRef?: RefObject<HTMLHeadingElement>;
  onCreated(completeOnMerge: boolean): void;
}) {
  const { tr } = useI18n();
  const [completeOnMerge, setCompleteOnMerge] = useState(true);
  return (
    <section className="planner-work planner-dialog-form">
      <h3 ref={headingRef} tabIndex={-1}>
        {item.title}
      </h3>
      <label className="planner-work-checkbox">
        <input type="checkbox" checked={completeOnMerge} onChange={(event) => setCompleteOnMerge(event.target.checked)} />
        {tr('Aufgabe nach PR-Merge automatisch abschließen', 'Complete task automatically after PR merge')}
      </label>
      <p className="planner-work-muted">
        {tr(
          'Aktiviert die Statusautomatik nach erfolgreicher PR-Erstellung. Spätere manuelle Statusänderungen pausieren sie wieder.',
          'Enables status automation after the PR is created successfully. Later manual status changes pause it again.',
        )}
      </p>
      <HostingCreateChangeRequest
        repository={repository}
        initialDraft={{
          title: item.title,
          body: item.description,
          sourceBranch: branch.name,
          targetBranch: branch.baseRef.replace(/^refs\/(?:heads\/|remotes\/[^/]+\/)/, ''),
          target: repository.parent || repository.ref,
        }}
        onCreated={() => onCreated(completeOnMerge)}
      />
    </section>
  );
}
