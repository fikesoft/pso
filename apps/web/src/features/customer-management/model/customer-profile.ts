import { customerManagementProfileSchema } from '@pos/contracts/customer-management';
export function customerProfileFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return customerManagementProfileSchema.parse({
    name: String(data.get('name') ?? '').trim() || null,
    phone: String(data.get('phone') ?? '').trim(),
    email: String(data.get('email') ?? '').trim() || null,
  });
}
