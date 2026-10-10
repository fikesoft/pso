'use client';
import { useId } from 'react';
import { Input } from './input';
import type { FieldProps } from '../model/primitives.types';

export function Field({ label, hint, children, ...props }: FieldProps) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children || (
        <Input
          {...props}
          id={id}
          aria-describedby={hint ? `${id}-hint` : props['aria-describedby']}
        />
      )}{' '}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
