import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import type { buttonVariants } from '../config/button.constants';
export type ShadcnButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };
