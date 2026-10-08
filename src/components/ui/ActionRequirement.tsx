import { cloneElement, useId, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { Info } from 'lucide-react';
import { Button } from './Button';
import { cx } from './classNames';

type Props = {
  children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  reason?: string | null;
  /** Omit the label to make the explanation itself the configuration link. */
  remedy?: { label?: string; onClick: () => void };
  className?: string;
};

/** A persistent prerequisite, rather than an error notification or a disabled link. */
export function ActionRequirement({ children, reason, remedy, className }: Props) {
  const descriptionId = useId();
  if (!reason) return children;
  return (
    <div className={cx('ui-action-requirement', className)}>
      {cloneElement(children, {
        disabled: true,
        title: reason,
        'aria-describedby': [children.props['aria-describedby'], descriptionId].filter(Boolean).join(' '),
      })}
      <ActionRequirementHelp id={descriptionId} reason={reason} remedy={remedy} />
    </div>
  );
}

/** Shared guidance for a disabled action or the field needed to enable it. */
export function ActionRequirementHelp({ id, reason, remedy }: Pick<Props, 'reason' | 'remedy'> & { id: string }) {
  if (!reason) return null;
  return (
    <div className="ui-action-requirement__help">
      <Info size={13} aria-hidden="true" />
      {remedy && !remedy.label ? (
        <Button id={id} className="ui-action-requirement__remedy" size="xs" variant="ghost" onClick={remedy.onClick}>
          {reason}
        </Button>
      ) : (
        <>
          <span id={id}>{reason}</span>
          {remedy && (
            <Button className="ui-action-requirement__remedy" size="xs" variant="ghost" onClick={remedy.onClick}>
              {remedy.label}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
