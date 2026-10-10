'use client';
import { Empty, Notice, PageTitle } from '@pos/ui';
import { operationalMessages, websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteDeliveryProps } from '../model/website-delivery.types';
import { WebsiteConnections } from './website-connections';
import { WebsiteInbox } from './website-inbox';
export function WebsiteDelivery(props: WebsiteDeliveryProps) {
  return (
    <div className="website-delivery">
      <PageTitle title={text.title} description={text.description} eyebrow={props.locationName} />
      {props.canManage && <WebsiteConnections {...props} />}
      {!props.locationId ? (
        <Empty
          title={operationalMessages.chooseLocation}
          description={operationalMessages.chooseLocationHint}
        />
      ) : props.canRead ? (
        <>
          <Notice tone="info">{text.awaitingHint}</Notice>
          <WebsiteInbox {...props} />
        </>
      ) : null}
    </div>
  );
}
