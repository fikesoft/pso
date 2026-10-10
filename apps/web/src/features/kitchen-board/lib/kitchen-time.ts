export function kitchenServerNow(serverTime: string, receivedAt: number, monotonicNow: number) {
  const server = Date.parse(serverTime);
  if (![server, receivedAt, monotonicNow].every(Number.isFinite)) return undefined;
  return server + Math.max(0, monotonicNow - receivedAt);
}

export function kitchenElapsed(createdAt: string, completedAt: string | undefined, now?: number) {
  const start = Date.parse(createdAt);
  const end = completedAt ? Date.parse(completedAt) : now;
  if (!Number.isFinite(start) || end === undefined || !Number.isFinite(end)) return undefined;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function formatKitchenDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts = hours ? [hours, minutes, remainder] : [minutes, remainder];
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
}
