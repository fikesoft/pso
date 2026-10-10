import { Button, Field, Loading } from '@pos/ui';
import type { DeliveryCommand } from '@pos/contracts';
import type { DeliveryFormProps } from '../model/delivery.types';
import { deliveryMessages as text } from '@pos/ui/locales';
export function DeliveryForm({ model, order, status, options, blocked }: DeliveryFormProps) {
  const state = order.deliveryStatus ?? 'WAITING_COURIER';
  const alternatives =
    model.couriers.data?.couriers.filter((courier) => courier.id !== order.deliveryCourierId) ?? [];
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void model.submit(status);
      }}
    >
      <fieldset className="operation-fields" disabled={blocked}>
        <label className="field">
          <span>{text.status}</span>
          <select
            aria-label={text.status}
            value={status}
            onChange={(event) =>
              model.patchForm({ status: event.target.value as DeliveryCommand['status'] })
            }
          >
            {options.map((value) => (
              <option key={value} value={value}>
                {text.statuses[value]}
              </option>
            ))}
          </select>
        </label>
        {status === 'ASSIGNED' && (
          <>
            {model.couriers.loading ? (
              <Loading />
            ) : (
              <label className="field">
                <span>{text.courier}</span>
                <select
                  required
                  aria-label={text.courier}
                  value={model.form.courierUserId}
                  onChange={(event) => model.patchForm({ courierUserId: event.target.value })}
                >
                  <option value="">{text.choose}</option>
                  {alternatives.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!model.couriers.loading &&
              model.couriers.data &&
              !alternatives.length &&
              !model.couriers.data.nextCursor && (
                <p>{order.deliveryCourierId ? text.noAlternatives : text.noCouriers}</p>
              )}
            {model.couriers.data?.nextCursor && (
              <Button
                type="button"
                variant="secondary"
                busy={model.couriers.loadingMore}
                onClick={() => void model.moreCouriers()}
              >
                {text.moreCouriers}
              </Button>
            )}
          </>
        )}
        <Field
          label={text.reason}
          value={model.form.reason}
          minLength={3}
          maxLength={500}
          required={
            status === 'FAILED' ||
            status === 'WAITING_COURIER' ||
            (status === 'ASSIGNED' && state === 'ASSIGNED')
          }
          onChange={(event) => model.patchForm({ reason: event.target.value })}
        />
      </fieldset>
      <Button
        type="submit"
        busy={model.busy}
        disabled={
          blocked || (status === 'ASSIGNED' && (model.couriers.loading || !!model.couriers.error))
        }
      >
        {text.save}
      </Button>
    </form>
  );
}
