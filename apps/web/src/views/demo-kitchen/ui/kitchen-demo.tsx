'use client';
import { roMessages, Button, Badge, Monitor, ArrowLeft } from '@pos/ui';
import { useState } from 'react';
import { demoTickets } from '../config/tickets.constants';
export function KitchenDemo() {
  const [large, setLarge] = useState(false);
  return (
    <main className={`kitchen-demo ${large ? 'kitchen-large' : ''}`}>
      <header className="kitchen-header">
        <div className="kitchen-brand">
          <Monitor size={30} />
          <div>
            <h1>{roMessages.message012}</h1>
            <p>{roMessages.message013}</p>
          </div>
        </div>
        <div className="inline">
          <Badge tone="warning">{roMessages.message014}</Badge>
          <Button variant="secondary" onClick={() => setLarge(!large)}>
            {large ? roMessages.message015 : roMessages.message016}
          </Button>
          <a href="/" className="icon-button" aria-label={roMessages.message017}>
            <ArrowLeft size={22} />
          </a>
        </div>
      </header>
      <div className="kitchen-status">
        <span>
          <i />
          {roMessages.message018}
        </span>
        <p>{roMessages.message019}</p>
      </div>
      <div className="ticket-grid">
        {demoTickets.map((t) => (
          <article className={`kitchen-ticket ${t.tone}`} key={t.id}>
            <header>
              <div>
                <span>#{t.id}</span>
                <h2>{t.table}</h2>
              </div>
              <div className="ticket-time">
                {t.time}
                <small>{roMessages.message020}</small>
              </div>
            </header>
            <div className="ticket-state">
              {t.tone === 'fresh' ? roMessages.message021 : roMessages.message022}
            </div>
            <div className="ticket-items">
              {t.items.map((item, i) => (
                <div className="ticket-item" key={i}>
                  <span>{item.qty}×</span>
                  <div>
                    <h3>{item.name}</h3>
                    {item.note && <p>{item.note}</p>}
                  </div>
                </div>
              ))}
            </div>
            <footer>
              {roMessages.message023} {t.items.reduce((sum, item) => sum + item.qty, 0)}{' '}
              {roMessages.message024}
            </footer>
          </article>
        ))}
      </div>
      <div className="kitchen-demo-foot">{roMessages.message025}</div>
    </main>
  );
}
