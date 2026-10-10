import type { ModifierGroupSnapshotDto } from '@pos/contracts';

export function ModifierSnapshot({ groups }: { groups: readonly ModifierGroupSnapshotDto[] }) {
  const visible = groups.filter((group) => group.options.length > 0);
  if (!visible.length) return null;
  return (
    <ul className="modifier-snapshot">
      {visible.map((group) => (
        <li key={`${group.bindingId}:${group.position}`}>
          <span>{group.groupName}: </span>
          {group.options.map((option) => option.optionName).join(', ')}
        </li>
      ))}
    </ul>
  );
}
