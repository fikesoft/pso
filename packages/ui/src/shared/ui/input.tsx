import type { InputProps } from '../model/primitives.types';
import { cn } from '../lib/utils';
export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex min-h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
