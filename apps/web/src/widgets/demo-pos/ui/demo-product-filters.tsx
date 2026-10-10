import { roMessages, Search } from '@pos/ui';
import type { DemoPosComponentProps } from '../model/demo-pos.types';
import { demoTables, demoCategories } from '../config/navigation.constants';
export function DemoProductFilters({ model }: DemoPosComponentProps) {
  const { category, setCategory, query, setQuery, table, changeTable } = model;
  return (
    <>
      <div className="pos-heading">
        <div>
          <span className="eyebrow">{roMessages.message053}</span>
          <h1>{roMessages.message054}</h1>
        </div>
        <label className="field">
          <span>{roMessages.message055}</span>
          <select value={table} onChange={(e) => changeTable(e.target.value)}>
            {demoTables.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="search-field demo-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={roMessages.message058}
          aria-label={roMessages.message059}
        />
      </div>
      <nav className="category-nav" aria-label={roMessages.message060}>
        {demoCategories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={c === category ? 'active' : ''}>
            {c}
          </button>
        ))}
      </nav>
    </>
  );
}
