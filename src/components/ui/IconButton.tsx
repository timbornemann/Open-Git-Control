import React from 'react';
import { cx } from './classNames';

type IconButtonVariant = 'ghost' | 'secondary' | 'danger' | 'primary';
type IconButtonSize = 'xs' | 'sm' | 'md';

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  'aria-label': string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, size = 'sm', title, type = 'button', variant = 'ghost', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      title={title ?? props['aria-label']}
      className={cx('ui-icon-button', `ui-icon-button--${variant}`, `ui-icon-button--${size}`, className)}
      {...props}
    >
      {icon}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
