'use client';
import type { PageTitleProps } from '../model/primitives.types';

export function PageTitle({ eyebrow, title, description, children }: PageTitleProps) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
