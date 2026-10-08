import { cloneElement, useId, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { Info } from 'lucide-react';
import { Button } from './Button';
import { cx } from './classNames';

type Props = {
  children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  reason?: string | null;
  remedy?: { label: string; onClick: () => void };
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
      <div className="ui-action-requirement__help">
        <Info size={13} aria-hidden="true" />
        <span id={descriptionId}>{reason}</span>
        {remedy && (
          <Button className="ui-action-requirement__remedy" size="xs" variant="ghost" onClick={remedy.onClick}>
            {remedy.label}
          </Button>
        )}
      </div>
    </div>
  );
}
