import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/i18n';

export function PushDestinationFields({
  selected,
  destinationBranch,
  setDestinationBranch,
  targetBranches,
  setTargetBranches,
  force,
  setForce,
  invalidatePlan,
}: {
  selected: string[];
  destinationBranch: string;
  setDestinationBranch: Dispatch<SetStateAction<string>>;
  targetBranches: Record<string, string>;
  setTargetBranches: Dispatch<SetStateAction<Record<string, string>>>;
  force: boolean;
  setForce: Dispatch<SetStateAction<boolean>>;
  invalidatePlan: () => void;
}) {
  const { tr } = useI18n();
  return (
    <>
      <label>
        {tr('Zielbranch', 'Destination branch')}
        <input
          value={destinationBranch}
          onChange={(event) => {
            setDestinationBranch(event.target.value);
            invalidatePlan();
          }}
        />
      </label>
      <label className="hosting-checkbox">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => {
            setForce(event.target.checked);
            invalidatePlan();
          }}
        />
        Force with lease
      </label>
      {selected.map((name) => (
        <label key={name}>
          {tr(`Zielbranch für ${name}`, `Destination branch for ${name}`)}
          <input
            value={targetBranches[name] ?? ''}
            placeholder={destinationBranch}
            onChange={(event) => {
              setTargetBranches({ ...targetBranches, [name]: event.target.value });
              invalidatePlan();
            }}
          />
        </label>
      ))}
    </>
  );
}
