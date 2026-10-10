export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_REJECTED',
    public details?: Readonly<Record<string, string>>,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status = 403,
  message = 'Acces interzis',
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
