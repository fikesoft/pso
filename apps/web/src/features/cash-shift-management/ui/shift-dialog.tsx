import { Button, Loading, Modal, Notice } from '@pos/ui';
import { cashShiftMessages as text, cashMovementMessages as movement } from '@pos/ui/locales';
import type { ShiftDialogProps } from '../model/shift-management.types';
import { ShiftCommandStatus } from './shift-command-status';
import { ShiftSummary } from './shift-summary';
import { ShiftOpenForm } from './shift-open-form';
import { ShiftCloseForm } from './shift-close-form';
import { ShiftMovementForm } from './shift-movement-form';
import { ShiftMovements } from './shift-movements';
export function ShiftDialog({
  props,
  mode,
  setMode,
  detail,
  command,
  mayClose,
  mayMove,
  onRefresh,
}: ShiftDialogProps) {
  const locked = command.busy || command.recovery.blocked || props.externalBlocked;
  const title =
    mode === 'OPEN'
      ? text.open
      : mode === 'CLOSE'
        ? text.close
        : mode === 'CASH_IN'
          ? movement.enter
          : mode === 'CASH_OUT'
            ? movement.withdraw
            : text.details;
  return (
    <Modal
      open={!!mode}
      title={title}
      onOpenChange={(open) => {
        if (!open && !locked) setMode(null);
      }}
    >
      <ShiftCommandStatus command={command} onRefresh={onRefresh} />
      {mode === 'OPEN' && <ShiftOpenForm props={props} command={command} />}
      {mode !== 'OPEN' && detail.loading && <Loading />}
      {mode !== 'OPEN' && detail.error && <Notice>{detail.error}</Notice>}
      {mode !== 'OPEN' && !detail.loading && !detail.error && detail.data && (
        <>
          <p>
            {detail.data.shift.registerCode} · {detail.data.shift.registerName}
          </p>
          <p>
            {text.owner}: {detail.data.shift.ownerDisplayName}
          </p>
          <ShiftSummary detail={detail.data} />
          {props.can('orders.read') && props.onReviewResponsibilities && (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => {
                setMode(null);
                props.onReviewResponsibilities?.();
              }}
            >
              Verifică responsabilitățile comenzilor
            </Button>
          )}
          {mode === 'CLOSE' && mayClose && (
            <ShiftCloseForm
              key={`${detail.data.shift.id}:${detail.data.shift.version}`}
              detail={detail.data}
              actorUserId={props.actorUserId}
              command={command}
            />
          )}
          {(mode === 'CASH_IN' || mode === 'CASH_OUT') && mayMove && (
            <ShiftMovementForm
              key={`${mode}:${detail.data.shift.id}:${detail.data.shift.version}`}
              detail={detail.data}
              direction={mode === 'CASH_IN' ? 'IN' : 'OUT'}
              command={command}
            />
          )}
          {mode === 'DETAIL' && (
            <>
              <div className="form-footer">
                <Button variant="secondary" disabled={locked} onClick={() => void onRefresh()}>
                  {text.refresh}
                </Button>
                {mayMove && (
                  <>
                    <Button
                      disabled={locked}
                      onClick={() => {
                        command.reset();
                        setMode('CASH_IN');
                      }}
                    >
                      {movement.enter}
                    </Button>
                    <Button
                      disabled={locked}
                      onClick={() => {
                        command.reset();
                        setMode('CASH_OUT');
                      }}
                    >
                      {movement.withdraw}
                    </Button>
                  </>
                )}
                {mayClose && (
                  <Button
                    disabled={locked}
                    onClick={() => {
                      command.reset();
                      setMode('CLOSE');
                    }}
                  >
                    {text.close}
                  </Button>
                )}
              </div>
              <ShiftMovements key={detail.data.shift.id} detail={detail.data} props={props} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
