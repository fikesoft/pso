import { cva } from 'class-variance-authority';
export const buttonVariants = cva(
  'button inline-flex items-center justify-center gap-2 disabled:pointer-events-none focus-visible:outline-2 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'button-primary',
        outline: 'button-secondary',
        secondary: 'button-secondary',
        ghost: 'button-ghost',
        destructive: 'button-danger',
        link: 'underline-offset-4 hover:underline',
      },
      size: { default: 'min-h-11', sm: 'min-h-11', lg: 'min-h-12', icon: 'size-11 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
