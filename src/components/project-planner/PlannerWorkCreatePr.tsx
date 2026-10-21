import type { RefObject } from 'react';
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
  onCreated(): void;
}) {
  const { tr } = useI18n();
  return (
    <section className="planner-work planner-dialog-form">
      <h3 ref={headingRef} tabIndex={-1}>
        {item.title}
      </h3>
      <p className="planner-work-muted">
        {tr(
          'Mit dem Erstellen des PRs wird die Statusautomatik aktiviert. Nach dem bestätigten Merge wird diese Aufgabe automatisch erledigt. Spätere manuelle Statusänderungen pausieren die Automatik wieder.',
          'Creating the PR enables status automation. After its confirmed merge, this task is completed automatically. Later manual status changes pause automation again.',
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
        onCreated={onCreated}
      />
    </section>
  );
}
