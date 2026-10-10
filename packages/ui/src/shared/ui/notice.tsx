'use client';
import { AlertCircle, Check } from 'lucide-react';
import type { NoticeProps } from '../model/primitives.types';

export function Notice({ children, tone = 'error' }: NoticeProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`notice notice-${tone}`}>
      {tone === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  );
}
