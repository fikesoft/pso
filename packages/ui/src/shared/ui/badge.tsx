'use client';
import type { BadgeProps } from '../model/primitives.types';

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
