import type { Router } from 'express';
import {
  createUpsellRuleSchema,
  idSchema,
  updateUpsellRuleSchema,
  upsellRulesQuerySchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireUpsellAccess, validateUpsellRule } from '../model/upsell-policy';
import { upsellRuleResponses } from '../model/upsell-response';

export function addUpsellRuleRoutes(router: Router) {
  router.get(
    '/catalog/upsell-rules',
    endpoint(async (tx, access, auth, req) => {
      const query = upsellRulesQuerySchema.parse(req.query);
      requireUpsellAccess(access, auth.user.id, query.locationId);
      const rules = await tx.upsellRule.findMany({
        where: {
          locationId: query.locationId,
          ...(query.includeArchived ? {} : { status: 'ACTIVE' }),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        rules: await upsellRuleResponses(tx, rules.slice(0, query.limit)),
        nextCursor: rules.length > query.limit ? rules[query.limit - 1]!.id : null,
      };
    }),
  );
  router.get(
    '/catalog/upsell-rules/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const rule = await tx.upsellRule.findUnique({ where: { id } });
      assert(rule, 404, 'Regula nu există');
      requireUpsellAccess(access, auth.user.id, rule.locationId);
      return { rule: (await upsellRuleResponses(tx, [rule]))[0]! };
    }),
  );
  router.post(
    '/catalog/upsell-rules',
    endpoint(async (tx, access, auth, req) => {
      const body = createUpsellRuleSchema.parse(req.body);
      requireUpsellAccess(access, auth.user.id, body.locationId, true);
      const hash = requestHash(body);
      const previous = await tx.upsellRule.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru o altă regulă.',
        );
        return { rule: (await upsellRuleResponses(tx, [previous]))[0]! };
      }
      await validateUpsellRule(tx, body.locationId, body.sourceProductId, body.targetProductId);
      const rule = await tx.upsellRule.create({
        data: {
          ...body,
          organizationId: access.org.id,
          createdByUserId: auth.user.id,
          requestHash: hash,
        },
      });
      await audit(
        tx,
        auth,
        req,
        'catalog.upsell_rule.created',
        'UPSELL_RULE',
        rule.id,
        rule.locationId,
      );
      return { rule: (await upsellRuleResponses(tx, [rule]))[0]! };
    }),
  );
  router.patch(
    '/catalog/upsell-rules/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = updateUpsellRuleSchema.parse(req.body);
      const current = await tx.upsellRule.findUnique({ where: { id } });
      assert(current, 404, 'Regula nu există');
      requireUpsellAccess(access, auth.user.id, current.locationId, true);
      assert(current.version === body.version, 409, 'Regula a fost modificată. Reîncărcați.');
      if (body.status === 'ACTIVE')
        await validateUpsellRule(
          tx,
          current.locationId,
          current.sourceProductId,
          current.targetProductId,
          id,
        );
      const rule = await tx.upsellRule.update({
        where: { id },
        data: { ...body, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth,
        req,
        'catalog.upsell_rule.updated',
        'UPSELL_RULE',
        id,
        current.locationId,
      );
      return { rule: (await upsellRuleResponses(tx, [rule]))[0]! };
    }),
  );
}
