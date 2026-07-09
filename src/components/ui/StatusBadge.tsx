import React from 'react';
import { cx } from './classNames';

type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'merged' | 'accent';

export type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  icon?: React.ReactNode;
  tone?: StatusBadgeTone;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ children, className, icon, tone = 'neutral', ...props }) => (
  <span className={cx('ui-status-badge', `ui-status-badge--${tone}`, className)} {...props}>
    {icon ? <span className="ui-status-badge__icon">{icon}</span> : null}
    <span className="ui-status-badge__label">{children}</span>
  </span>
);
