'use client';
import { ChevronRight } from 'lucide-react';
import { roMessages } from '../i18n';
import type { BreadcrumbProps } from '../model/primitives.types';

export function Breadcrumb({ children }: BreadcrumbProps) {
  return (
    <div className="breadcrumb">
      {roMessages.message433} <ChevronRight size={13} />
      <span>{children}</span>
    </div>
  );
}
