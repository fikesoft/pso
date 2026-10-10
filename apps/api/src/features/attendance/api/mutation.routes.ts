import { randomUUID } from 'node:crypto';
import { attendanceActionSchema, attendanceStartSchema, idSchema } from '@pos/contracts';
import { Router } from 'express';
import type { TenantTransaction } from '@pos/db';
import { loadWorkShiftEntries, workShiftDto } from '../../../entities/attendance';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert, HttpError } from '../../../shared/lib/http';
import { attendanceLocation } from '../model/attendance-authorization';
import { attendanceRequestHash } from '../model/request-hash';

function rethrowConcurrency(error: unknown): never {
  const known = error as { code?: string; meta?: { code?: string } };
  if (known.code === 'P2034' || known.meta?.code === '40001')
    throw new HttpError(409, 'Tura a fost modificată. Reîncărcați.', 'STALE_SHIFT');
  throw error;
}
async function shiftResponse(tx: TenantTransaction, shiftId: string) {
  const shift = await tx.workShift.findUniqueOrThrow({ where: { id: shiftId } });
  const [entry] = await loadWorkShiftEntries(tx, [shift]);
  return { shift: workShiftDto(entry!.shift, entry!.breaks, new Date()) };
}

export function attendanceMutationRouter() {
  const router = Router();
  router.post(
    '/attendance/start',
    endpoint(async (tx, access, auth, req) => {
      const body = attendanceStartSchema.parse(req.body);
      attendanceLocation(access, body.locationId, auth.user.id, 'attendance.clock');
      const requestHash = attendanceRequestHash('START_SHIFT', body.locationId);
      const prior = await tx.attendanceEvent.findFirst({
        where: { organizationId: access.org.id, userId: auth.user.id, requestKey: body.requestKey },
      });
      if (prior) {
        assert(
          prior.requestHash === requestHash,
          409,
          'Cheia cererii a fost folosită cu alt conținut.',
        );
        return shiftResponse(tx, prior.shiftId);
      }
      const active = await tx.workShift.findFirst({
        where: { userId: auth.user.id, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      });
      if (active)
        throw new HttpError(
          409,
          active.locationId === body.locationId
            ? 'Aveți deja o tură activă.'
            : 'Aveți o tură activă în altă locație.',
          active.locationId === body.locationId ? 'ACTIVE_SHIFT_EXISTS' : 'ACTIVE_SHIFT_ELSEWHERE',
        );
      const shiftId = randomUUID();
      try {
        await tx.attendanceEvent.create({
          data: {
            organizationId: access.org.id,
            locationId: body.locationId,
            shiftId,
            userId: auth.user.id,
            actorUserId: auth.user.id,
            action: 'START_SHIFT',
            requestKey: body.requestKey,
            requestHash,
            shiftVersion: 1,
          },
        });
      } catch (error) {
        rethrowConcurrency(error);
      }
      await audit(
        tx,
        auth,
        req,
        'attendance.shift.started',
        'WORK_SHIFT',
        shiftId,
        body.locationId,
      );
      return shiftResponse(tx, shiftId);
    }),
  );
  router.post(
    '/attendance/shifts/:id/action',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = attendanceActionSchema.parse(req.body);
      const shift = await tx.workShift.findUnique({ where: { id } });
      assert(shift?.userId === auth.user.id, 404, 'Tura nu există.');
      attendanceLocation(access, shift.locationId, auth.user.id, 'attendance.clock');
      const requestHash = attendanceRequestHash(body.action, shift.locationId, id, body.version);
      const prior = await tx.attendanceEvent.findFirst({
        where: { organizationId: access.org.id, userId: auth.user.id, requestKey: body.requestKey },
      });
      if (prior) {
        assert(
          prior.requestHash === requestHash,
          409,
          'Cheia cererii a fost folosită cu alt conținut.',
        );
        return shiftResponse(tx, prior.shiftId);
      }
      assert(shift.version === body.version, 409, 'Tura a fost modificată. Reîncărcați.');
      assert(
        (body.action === 'START_BREAK' && shift.status === 'ACTIVE') ||
          (body.action === 'END_BREAK' && shift.status === 'ON_BREAK') ||
          (body.action === 'END_SHIFT' && shift.status !== 'ENDED'),
        409,
        'Acțiunea nu este permisă în starea curentă.',
      );
      try {
        await tx.attendanceEvent.create({
          data: {
            organizationId: access.org.id,
            locationId: shift.locationId,
            shiftId: id,
            userId: auth.user.id,
            actorUserId: auth.user.id,
            action: body.action,
            requestKey: body.requestKey,
            requestHash,
            shiftVersion: body.version + 1,
          },
        });
      } catch (error) {
        rethrowConcurrency(error);
      }
      await audit(
        tx,
        auth,
        req,
        `attendance.${body.action.toLowerCase()}`,
        'WORK_SHIFT',
        id,
        shift.locationId,
      );
      return shiftResponse(tx, id);
    }),
  );
  return router;
}
