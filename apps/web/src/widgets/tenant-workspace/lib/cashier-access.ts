export function canOpenCashier(can: (permission: string) => boolean) {
  return (
    can('orders.create') ||
    (can('orders.read') && (can('payments.collect') || can('payments.refund')))
  );
}
