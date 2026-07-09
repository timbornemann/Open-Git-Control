import React from 'react';
import { cx } from './classNames';

type PanelTone = 'default' | 'muted' | 'danger' | 'success' | 'warning' | 'info';
type PanelPadding = 'none' | 'sm' | 'md';

export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
  padding?: PanelPadding;
  tone?: PanelTone;
};

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(({ className, disabled = false, padding = 'sm', tone = 'default', ...props }, ref) => (
  <div ref={ref} className={cx('ui-panel', `ui-panel--${tone}`, `ui-panel--padding-${padding}`, disabled && 'ui-panel--disabled', className)} {...props} />
));

Panel.displayName = 'Panel';
