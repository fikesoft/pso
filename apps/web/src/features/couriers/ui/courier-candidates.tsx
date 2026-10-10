import { Button, Notice, Select } from '@pos/ui';
import { courierMessages as text } from '@pos/ui/locales';
import type { CourierCandidatesProps } from '../model/courier.types';
export function CourierCandidates({
  data,
  loading,
  error,
  value,
  onChange,
  more,
  disabled,
}: CourierCandidatesProps) {
  return (
    <>
      <Select
        label={text.user}
        required
        value={value}
        disabled={disabled || loading || !!error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{text.chooseUser}</option>
        {!error &&
          data?.candidates.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.displayName}
            </option>
          ))}
      </Select>
      {error && <Notice>{error}</Notice>}
      {!error && data?.nextCursor && (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || loading}
          onClick={() => void more()}
        >
          {text.moreCandidates}
        </Button>
      )}
    </>
  );
}
