import { roMessages, Button, Select, Notice, ShieldCheck } from '@pos/ui';
import type { DelegationFormProps } from '../model/delegation-form.types';
import { useDelegationForm } from '../model/use-delegation-form';
import { AccessPreview, PermissionPicker, ScopeFields } from '../../../entities/access';
export function DelegationForm(props: DelegationFormProps) {
  const { api, users, locations, catalog } = props;
  const {
    userId,
    setUserId,
    scope,
    setScope,
    locationId,
    setLocationId,
    permissions,
    setPermissions,
    busy,
    error,
    previewed,
    setPreviewed,
    save,
  } = useDelegationForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      <Notice tone="info">{roMessages.message145}</Notice>
      <Select
        label={roMessages.message146}
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          setPreviewed(false);
        }}
        required
      >
        <option value="">{roMessages.message147}</option>
        {users
          .filter((u) => !u.isPrimaryAdmin && u.status !== 'DISABLED')
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
      </Select>
      <ScopeFields
        locations={locations}
        scope={scope}
        setScope={(v) => {
          setScope(v);
          setPermissions([]);
          setPreviewed(false);
        }}
        locationId={locationId}
        setLocationId={(v) => {
          setLocationId(v);
          setPreviewed(false);
        }}
      />
      <div>
        <h3 className="section-subtitle">{roMessages.message097}</h3>
        <PermissionPicker
          catalog={catalog}
          value={permissions}
          onChange={(v) => {
            setPermissions(v);
            setPreviewed(false);
          }}
          scope={scope}
          delegableOnly
        />
      </div>
      <AccessPreview
        key={`${userId}${scope}${locationId}${JSON.stringify(permissions)}`}
        api={api}
        scope={scope}
        locationId={locationId}
        permissions={permissions}
        simulate={false}
        onPreview={() => setPreviewed(true)}
      />
      <div className="form-footer">
        <Button type="submit" busy={busy} disabled={!permissions.length || !userId || !previewed}>
          <ShieldCheck size={16} />
          {roMessages.message148}
        </Button>
      </div>
    </form>
  );
}
