import { roMessages, Button, Select, Notice } from '@pos/ui';
import type { AccessFormProps } from '../model/access-form.types';
import { useAccessForm } from '../model/use-access-form';
import { AccessPreview, ScopeFields } from '../../../entities/access';
export function AccessForm(props: AccessFormProps) {
  const { api, user, locations, roles, catalog } = props;
  const {
    mode,
    setMode,
    scope,
    setScope,
    locationId,
    setLocationId,
    roleVersionId,
    setRoleVersionId,
    permission,
    setPermission,
    effect,
    setEffect,
    busy,
    error,
    previewed,
    setPreviewed,
    save,
  } = useAccessForm(props);
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <Notice>{error}</Notice>}
      <Select
        label={roMessages.message149}
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          setPreviewed(false);
        }}
      >
        <option value="assignment">{roMessages.message150}</option>
        <option value="override">{roMessages.message151}</option>
      </Select>
      <ScopeFields
        locations={locations}
        scope={scope}
        setScope={(v) => {
          setScope(v);
          setPermission('');
          setPreviewed(false);
        }}
        locationId={locationId}
        setLocationId={(v) => {
          setLocationId(v);
          setPreviewed(false);
        }}
      />
      {mode === 'assignment' ? (
        <Select
          label={roMessages.message152}
          value={roleVersionId}
          onChange={(e) => {
            setRoleVersionId(e.target.value);
            setPreviewed(false);
          }}
          required
        >
          <option value="">{roMessages.message153}</option>
          {roles.map((r) =>
            r.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {r.name} {roMessages.message142}
                {v.version}
              </option>
            )),
          )}
        </Select>
      ) : (
        <>
          <Select
            label={roMessages.message154}
            value={permission}
            onChange={(e) => {
              setPermission(e.target.value);
              setPreviewed(false);
            }}
            required
          >
            <option value="">{roMessages.message155}</option>
            {catalog
              .filter((p) => effect === 'DENY' || p.scopeTypes.includes(scope))
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
          </Select>
          <Select
            label={roMessages.message156}
            value={effect}
            onChange={(e) => {
              setEffect(e.target.value);
              setPreviewed(false);
            }}
          >
            <option value="DENY">{roMessages.message157}</option>
            <option value="ALLOW">{roMessages.message158}</option>
          </Select>
          <Notice tone="info">{roMessages.message159}</Notice>
        </>
      )}
      <AccessPreview
        key={`${mode}${scope}${locationId}${permission}${effect}${roleVersionId}`}
        api={api}
        userId={user.id}
        scope={scope}
        locationId={locationId}
        effect={mode === 'override' ? (effect as 'ALLOW' | 'DENY') : undefined}
        permissions={
          mode === 'assignment'
            ? roles.flatMap((r) => r.versions).find((v) => v.id === roleVersionId)?.permissions
            : permission
              ? [{ permission }]
              : []
        }
        onPreview={() => setPreviewed(true)}
      />
      <p className="text-small">{roMessages.message160}</p>
      <div className="form-footer">
        <Button type="submit" busy={busy} disabled={!previewed}>
          {roMessages.message161}
        </Button>
      </div>
    </form>
  );
}
