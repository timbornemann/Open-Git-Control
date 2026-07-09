import React from 'react';
import { cx } from './classNames';

type InputFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  as?: 'input';
  fieldSize?: 'sm' | 'md';
};

type TextareaFieldProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  as: 'textarea';
  fieldSize?: 'sm' | 'md';
};

export type TextFieldProps = InputFieldProps | TextareaFieldProps;

export const TextField = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(
  ({ as = 'input', className, fieldSize = 'sm', ...props }, ref) => {
    if (as === 'textarea') {
      return (
        <textarea
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
          className={cx('ui-field', 'ui-field--textarea', `ui-field--${fieldSize}`, className)}
          {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      );
    }

    return (
      <input
        ref={ref as React.ForwardedRef<HTMLInputElement>}
        className={cx('ui-field', `ui-field--${fieldSize}`, className)}
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
    );
  },
);

TextField.displayName = 'TextField';
