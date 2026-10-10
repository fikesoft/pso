'use client';
import { LoaderCircle } from 'lucide-react';
import { ro } from '../i18n/ro';
import type { LoadingProps } from '../model/primitives.types';

export function Loading({ label = ro.states.loading }: LoadingProps) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      {label}
    </div>
  );
}
