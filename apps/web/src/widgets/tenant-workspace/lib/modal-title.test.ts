import { describe, expect, it } from 'vitest';
import type { Grant, Location, Role, User } from '@pos/ui/types';
import type { WorkspaceModal } from '../model/workspace-input.types';
import { workspaceModalTitle } from './modal-title';

describe('tenant workspace dialog titles', () => {
  const user: User = { id: 'user-1', displayName: 'Ana Popescu', login: 'ana', version: 1 };
  const location: Location = {
    id: 'location-a',
    name: 'Centru',
    code: 'A',
    status: 'ACTIVE',
    version: 1,
  };
  const role: Role = { id: 'role-1', name: 'Chelner', versions: [] };
  const grant: Grant = {
    id: 'grant-1',
    userId: user.id,
    scopeType: 'LOCATION',
    locationId: location.id,
    status: 'ACTIVE',
    permissions: [],
  };

  it.each([
    [{ kind: 'location' }, 'Locație nouă'],
    [{ kind: 'location', value: location }, 'Editează locația'],
    [{ kind: 'staff' }, 'Adaugă în echipă'],
    [{ kind: 'staff', value: user }, 'Editează persoana'],
    [{ kind: 'role' }, 'Creează un rol'],
    [{ kind: 'role', value: role }, 'Versiune nouă de rol'],
    [{ kind: 'delegation' }, 'Plafon nou de delegare'],
    [{ kind: 'role-history', value: role }, 'Istoricul rolului'],
    [{ kind: 'person', value: user }, 'Ana Popescu'],
    [{ kind: 'access', value: user }, 'Modifică accesul'],
    [{ kind: 'reset', value: user }, 'Resetează parola'],
    [{ kind: 'revoke', value: grant }, 'Revocă plafonul de delegare'],
    [{ kind: 'remove-assignment:assignment-1', value: user }, 'Retrage atribuirea de rol'],
    [{ kind: 'remove-override:override-1', value: user }, 'Retrage excepția individuală'],
  ] satisfies [WorkspaceModal, string][])('labels %o as "%s"', (modal, expected) => {
    expect(workspaceModalTitle(modal)).toBe(expected);
  });
});
