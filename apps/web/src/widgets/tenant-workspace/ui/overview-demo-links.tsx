import { roMessages, Badge, ShieldCheck, ArrowUpRight, Store, Monitor } from '@pos/ui';
export function OverviewDemoLinks() {
  return (
    <>
      <div className="quicklinks">
        <a href="/demo/pos">
          <Store size={16} />
          {roMessages.message197}
          <Badge>{roMessages.message014}</Badge>
          <ArrowUpRight size={13} />
        </a>
        <a href="/demo/kitchen">
          <Monitor size={16} />
          {roMessages.message198}
          <Badge>{roMessages.message014}</Badge>
          <ArrowUpRight size={13} />
        </a>
      </div>
      <div className="section-note">
        <ShieldCheck size={13} />
        {roMessages.message199}
      </div>
    </>
  );
}
