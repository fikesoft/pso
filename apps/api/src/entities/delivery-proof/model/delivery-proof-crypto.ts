import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { deliveryProofSchema } from '@pos/contracts';
import type { DeliveryProof } from '@pos/contracts';
import { config } from '../../../shared/config';
import {
  DELIVERY_PROOF_DOMAIN,
  DELIVERY_PROOF_IV_BYTES,
  DELIVERY_PROOF_TAG_BYTES,
} from '../config/delivery-proof.constants';
import type { DeliveryProofContext } from './delivery-proof.types';
function key(purpose: string) {
  return createHmac('sha256', Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'))
    .update(`${DELIVERY_PROOF_DOMAIN}:${purpose}`)
    .digest();
}
function aad(context: DeliveryProofContext) {
  return Buffer.from(
    JSON.stringify([
      DELIVERY_PROOF_DOMAIN,
      context.organizationId,
      context.locationId,
      context.orderId,
      context.operationId,
      context.assignmentId,
      context.actorUserId,
    ]),
  );
}
export function deliveryProofRequestHash(body: unknown) {
  return createHmac('sha256', key('request')).update(JSON.stringify(body)).digest('hex');
}
export function encryptDeliveryProof(context: DeliveryProofContext, proof: DeliveryProof) {
  const iv = randomBytes(DELIVERY_PROOF_IV_BYTES),
    cipher = createCipheriv('aes-256-gcm', key('data'), iv);
  cipher.setAAD(aad(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(proof), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptDeliveryProof(context: DeliveryProofContext, data: string): DeliveryProof {
  const bytes = Buffer.from(data, 'base64'),
    start = DELIVERY_PROOF_IV_BYTES,
    end = start + DELIVERY_PROOF_TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key('data'), bytes.subarray(0, start));
  decipher.setAAD(aad(context));
  decipher.setAuthTag(bytes.subarray(start, end));
  return deliveryProofSchema.parse(
    JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(end)), decipher.final()]).toString('utf8'),
    ),
  );
}
