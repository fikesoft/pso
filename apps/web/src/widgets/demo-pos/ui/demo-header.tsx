import { roMessages, Badge, Store, ArrowLeft } from '@pos/ui';
export function DemoHeader() {
  return (
    <header className="pos-header">
      <a href="/" className="brand">
        <span className="brand-mark">
          <Store size={20} />
        </span>
        {roMessages.message047}
        <span className="brand-dot">.</span>
      </a>
      <div className="demo-identity">
        <strong>{roMessages.message048}</strong>
        <span>{roMessages.message049}</span>
      </div>
      <Badge tone="warning">{roMessages.message050}</Badge>
      <a href="/" className="icon-button" aria-label={roMessages.message051}>
        <ArrowLeft size={19} />
      </a>
    </header>
  );
}
