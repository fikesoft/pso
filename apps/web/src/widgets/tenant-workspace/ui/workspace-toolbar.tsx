import { roMessages, formatMessage, Search } from '@pos/ui';
import type { WorkspaceToolbarProps } from '../model/workspace-toolbar.types';
export function WorkspaceToolbar({ count, label, query, setQuery }: WorkspaceToolbarProps) {
  return (
    <div className="toolbar">
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label={formatMessage(roMessages.message164, label)}
          placeholder={formatMessage(roMessages.message165, label)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <small>
        {count} {label} {roMessages.message166}
      </small>
    </div>
  );
}
