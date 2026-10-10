'use client';
import { useId } from 'react';
import type { SelectProps } from '../model/primitives.types';

export function Select({ label, children, ...props }: SelectProps) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select {...props} id={id}>
        {children}
      </select>
    </div>
  );
}
