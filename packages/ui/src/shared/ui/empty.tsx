'use client';
import { Building2 } from 'lucide-react';
import type { EmptyProps } from '../model/primitives.types';

export function Empty({ title, description, children }: EmptyProps) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Building2 size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
