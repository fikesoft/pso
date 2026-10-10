'use client';

// Locally maintained shadcn/ui Radix Button composition. See ui-flows.md for provenance.
import { Slot } from '@radix-ui/react-slot';
import { buttonVariants } from '../config/button.constants';
import type { ShadcnButtonProps } from '../model/shadcn-button.types';
import { cn } from '../lib/utils';
export function ShadcnButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ShadcnButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
