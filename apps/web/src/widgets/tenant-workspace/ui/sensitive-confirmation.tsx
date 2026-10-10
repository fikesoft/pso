import { PIN_MIN_LENGTH, PIN_MAX_LENGTH, PIN_PATTERN } from '@pos/contracts/pin';
import { roMessages, pinMessages, normalizePinInput, Button, Field, Notice } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function SensitiveConfirmation({ model }: WorkspaceComponentProps) {
  const { modal, setModal, busy, modalError, sensitive } = model;
  if (!modal || !['reset', 'reset-pin', 'revoke'].includes(modal.kind)) return null;
  const pin = modal.kind === 'reset-pin';
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void sensitive();
      }}
    >
      {modalError && <Notice>{modalError}</Notice>}
      <Notice tone="info">
        {pin
          ? pinMessages.resetPinHint
          : modal.kind === 'reset'
            ? roMessages.message317
            : roMessages.message318}
      </Notice>
      {modal.kind === 'reset' && modal.value?.authenticationMethod === 'PIN' && (
        <p className="scope-hint">{pinMessages.passwordTransition}</p>
      )}
      {pin && (
        <Field
          id="reset-pin-value"
          label={pinMessages.optionalPin}
          name="pin"
          type="password"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
          pattern={PIN_PATTERN}
          hint={pinMessages.generateHint}
          onChange={(event) => {
            event.currentTarget.value = normalizePinInput(event.currentTarget.value);
          }}
        />
      )}
      {modal.kind === 'revoke' && (
        <Field
          id="revoke-reason"
          label={roMessages.message319}
          minLength={5}
          placeholder={roMessages.message320}
          required
        />
      )}
      <div className="form-footer">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setModal(null)}>
          {roMessages.message321}
        </Button>
        <Button type="submit" variant="danger" busy={busy}>
          {pin
            ? pinMessages.resetPinConfirm
            : modal.kind === 'reset'
              ? roMessages.message322
              : roMessages.message323}
        </Button>
      </div>
    </form>
  );
}
