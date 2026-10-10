export const SHOWCASE = {
  version: 1,
  platformLogin: 'showcase-owner',
  passwordHours: 168,
  cycles: 4,
  customersPerLocation: 12,
  companies: [
    { slug: 'companie-plina', name: 'Nori Sushi · DEMO sintetic' },
    { slug: 'companie-goala', name: 'Companie goală · DEMO' },
  ],
  locations: [
    { code: 'CENTRU', name: 'Nori DEMO · Centru', address: 'Strada Exemplului DEMO, 1' },
    { code: 'BOTANICA', name: 'Nori DEMO · Botanica', address: 'Strada Exemplului DEMO, 2' },
    { code: 'RISCANI', name: 'Nori DEMO · Rîșcani', address: 'Strada Exemplului DEMO, 3' },
  ],
} as const;
export const ORDER_SCENARIOS = [
  'DRAFT',
  'CONFIRMED',
  'QUEUED',
  'PREPARING',
  'PACKING',
  'READY',
  'COMPLETED_UNPAID',
  'DEMO',
  'CASH',
  'CARD',
  'MIXED',
  'REFUNDED',
  'CANCELLED',
] as const;
export const SERVICE_ROTATION = ['DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY'] as const;
export const ORDER_NOTES = [
  'DEMO · porții pentru două persoane; fără tacâmuri suplimentare.',
  'DEMO · set pentru colegi; sosurile separat.',
  'DEMO · exercițiu de preparare și verificare a ambalajului.',
  'DEMO · comandă de familie; atenție la cantitățile comandate.',
] as const;
