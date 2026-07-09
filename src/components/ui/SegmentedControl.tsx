import React from 'react';
import { cx } from './classNames';

export type SegmentedControlOption<T extends string> = {
  label: React.ReactNode;
  title?: string;
  value: T;
};

export type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: Array<SegmentedControlOption<T>>;
  size?: 'xs' | 'sm';
  value: T;
};

export const SegmentedControl = <T extends string>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  size = 'sm',
  value,
}: SegmentedControlProps<T>) => (
  <div className={cx('ui-segmented-control', `ui-segmented-control--${size}`, className)} role="group" aria-label={ariaLabel}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          className={cx('ui-segmented-control__item', active && 'is-active')}
          aria-pressed={active}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          title={option.title}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
