import { StaffLocations } from './staff-locations';
import { StaffCredentials } from './staff-credentials';
import { roMessages, Button, Field, Select, Notice } from '@pos/ui';
import type { StaffFormProps } from '../model/staff-form.types';
import { useStaffForm } from '../model/use-staff-form';
import { AccessPreview, ScopeFields } from '../../../entities/access';
import { EmployeeFields } from './employee-fields';
export function StaffForm(props: StaffFormProps) {
  const { api, user, users, locations, roles } = props;
  const {
    locationIds,
    updateLocations,
    roleVersionId,
    setRoleVersionId,
    scope,
    setScope,
    locationId,
    setLocationId,
    busy,
    error,
    previewed,
    setPreviewed,
    selectedRole,
    authenticationMethod,
    setAuthenticationMethod,
    requiresPassword,
    save,
  } = useStaffForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      <Field
        label={roMessages.message127}
        name="displayName"
        defaultValue={user?.displayName}
        placeholder={roMessages.message128}
        minLength={2}
        required
      />
      {!user && (
        <StaffCredentials
          users={users}
          method={authenticationMethod}
          setMethod={setAuthenticationMethod}
          requiresPassword={requiresPassword}
        />
      )}
      {user && (
        <Select
          label={roMessages.message135}
          name="status"
          defaultValue={user.status === 'PENDING' ? 'ACTIVE' : user.status}
        >
          <option value="ACTIVE">{roMessages.message136}</option>
          <option value="DISABLED">{roMessages.message137}</option>
        </Select>
      )}
      <StaffLocations locations={locations} selected={locationIds} onChange={updateLocations} />
      <EmployeeFields user={user} />
      {!user && (
        <>
          <Select
            label={roMessages.message140}
            value={roleVersionId}
            onChange={(e) => {
              setRoleVersionId(e.target.value);
              setPreviewed(false);
            }}
          >
            <option value="">{roMessages.message141}</option>
            {roles.map((r) =>
              r.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {r.name} {roMessages.message142}
                  {v.version}
                </option>
              )),
            )}
          </Select>
          {roleVersionId && (
            <>
              <ScopeFields
                locations={locations.filter((l) => locationIds.includes(l.id))}
                scope={scope}
                setScope={(v) => {
                  setScope(v);
                  setPreviewed(false);
                }}
                locationId={locationId}
                setLocationId={(v) => {
                  setLocationId(v);
                  setPreviewed(false);
                }}
              />
              <AccessPreview
                key={`${roleVersionId}${scope}${locationId}${locationIds.join(',')}`}
                api={api}
                scope={scope}
                locationId={locationId}
                permissions={selectedRole?.permissions}
                onPreview={() => setPreviewed(true)}
              />
              <p className="text-small">{roMessages.message143}</p>
            </>
          )}
        </>
      )}
      <div className="form-footer">
        <Button
          busy={busy}
          type="submit"
          disabled={!locationIds.length || (!user && !!roleVersionId && !previewed)}
        >
          {user ? roMessages.message116 : roMessages.message144}
        </Button>
      </div>
    </form>
  );
}
