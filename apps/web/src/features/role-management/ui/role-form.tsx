import { roMessages, Button, Field, Notice } from '@pos/ui';
import type { RoleFormProps } from '../model/role-form.types';
import { useRoleForm } from '../model/use-role-form';
import { PermissionPicker } from '../../../entities/access';
export function RoleForm(props: RoleFormProps) {
  const { role, catalog } = props;
  const { permissions, setPermissions, busy, error, save } = useRoleForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      {role ? (
        <Notice tone="info">
          {roMessages.message118}
          {role.name}
          {roMessages.message119}
        </Notice>
      ) : (
        <>
          <Field
            label={roMessages.message120}
            name="name"
            placeholder={roMessages.message121}
            minLength={2}
            required
          />
          <Field
            label={roMessages.message122}
            name="description"
            placeholder={roMessages.message123}
          />
        </>
      )}
      <div>
        <h3 className="section-subtitle">{roMessages.message094}</h3>
        <p className="text-small">{roMessages.message124}</p>
        <PermissionPicker
          catalog={catalog}
          value={permissions}
          onChange={setPermissions}
          delegableOnly
        />
      </div>
      <div className="form-footer">
        <Button busy={busy} disabled={!permissions.length} type="submit">
          {role ? roMessages.message125 : roMessages.message126}
        </Button>
      </div>
    </form>
  );
}
