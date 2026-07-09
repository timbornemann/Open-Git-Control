import React from 'react';
import { cx } from './classNames';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, icon, size = 'sm', type = 'button', variant = 'secondary', ...props }, ref) => (
    <button ref={ref} type={type} className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)} {...props}>
      {icon ? <span className="ui-button__icon">{icon}</span> : null}
      {children ? <span className="ui-button__label">{children}</span> : null}
    </button>
  ),
);

Button.displayName = 'Button';
