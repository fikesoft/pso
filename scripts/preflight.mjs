const checks = [
  ['HTTPS tenant', process.env.TENANT_ORIGIN?.startsWith('https://')],
  ['HTTPS platformă', process.env.PLATFORM_ORIGIN?.startsWith('https://')],
  ['Control plane privat verificat', process.env.PLATFORM_PRIVATE_READY === 'true'],
  ['VPN CIDR explicit', /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(process.env.PRIVATE_VPN_CIDR ?? '')],
  ['Certificat mTLS', !!process.env.MTLS_CA_FILE],
  ['Destinație backup criptat', !!process.env.ENCRYPTED_BACKUP_TARGET],
  ['RPO/RTO confirmate', !!process.env.RPO_MINUTES && !!process.env.RTO_MINUTES],
  ['Cheie MFA separată', /^[a-f0-9]{64}$/.test(process.env.MFA_ENCRYPTION_KEY ?? '')],
];
for (const [label, pass] of checks) console.log(`${pass ? 'OK' : 'LIPSĂ'} ${label}`);
console.log(
  'Aceste verificări de configurare nu probează izolarea rețelei; se cer probe externe înaintea publicării.',
);
if (checks.some(([, pass]) => !pass)) process.exitCode = 1;
