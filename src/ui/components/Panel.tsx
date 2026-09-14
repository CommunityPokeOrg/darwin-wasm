import type { ReactNode } from 'react';
export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-title">{title}</div>{children}</section>;
}
