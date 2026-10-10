'use client';
import { LoaderCircle } from 'lucide-react';
import { ShadcnButton } from './shadcn-button';
import type { ButtonProps } from '../model/primitives.types';

export function Button({
  children,
  variant = 'primary',
  busy,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <ShadcnButton
      {...props}
      disabled={props.disabled || busy}
      variant={variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant}
      className={className}
    >
      {busy && <LoaderCircle className="spin" size={17} />} {children}
    </ShadcnButton>
  );
}
