import React from 'react';
import { cx } from './classNames';

type ToolbarAlign = 'start' | 'center' | 'end' | 'between';
type ToolbarGap = 'xs' | 'sm' | 'md';

export type ToolbarProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: ToolbarAlign;
  gap?: ToolbarGap;
  wrap?: boolean;
};

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(({ align = 'start', className, gap = 'sm', wrap = true, ...props }, ref) => (
  <div ref={ref} className={cx('ui-toolbar', `ui-toolbar--${align}`, `ui-toolbar--gap-${gap}`, wrap && 'ui-toolbar--wrap', className)} {...props} />
));

Toolbar.displayName = 'Toolbar';
