import { Button, Loading, Modal, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteOrderDialogProps } from '../model/website-delivery.types';
import { useWebsiteDecision } from '../model/use-website-decision';
import { WebsiteOrderInfo } from './website-order-info';
import { WebsiteDecisionActions } from './website-decision-actions';
export function WebsiteOrderDialog(props: WebsiteOrderDialogProps) {
  const model = useWebsiteDecision(props);
  return (
    <Modal
      open
      title={text.details}
      description={model.details.data?.externalOrderId}
      onOpenChange={(open) => {
        if (!open && !model.busy && !model.uncertain) props.onClose();
      }}
    >
      {(model.error || model.details.error) && (
        <Notice>{model.error || model.details.error}</Notice>
      )}
      {model.uncertain && <Notice tone="info">{text.unknown}</Notice>}
      {model.details.loading && <Loading />}
      {model.details.data && <WebsiteOrderInfo order={model.details.data} />}
      <div className="form-footer">
        <Button
          variant="secondary"
          busy={model.details.loading}
          disabled={model.busy}
          onClick={() => void model.reload()}
        >
          {text.reloadDetails}
        </Button>
      </div>
      <WebsiteDecisionActions
        model={model}
        canDecide={props.canDecide}
        onOpenOrders={props.onOpenOrders}
      />
    </Modal>
  );
}
