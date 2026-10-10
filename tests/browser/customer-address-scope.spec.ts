import { test, expect } from '@playwright/test';
import { customerAddressFixture, selectAddressCustomer } from './customer-address-setup';

test('adrese: lectura permite selecția fără gestionare și răspunsurile întârziate nu revin după schimbarea clientului sau locației', async ({
  browser,
}) => {
  const f = await customerAddressFixture(browser, false);
  const { operator, draft } = f;
  let release: (() => void) | undefined;
  try {
    const address = (
      await f.post(f.path, {
        locationId: f.location.id,
        requestKey: crypto.randomUUID(),
        address: 'Destinație client inițial',
      })
    ).address;
    const otherPath = `/customers/${f.otherCustomer.id}/addresses`;
    await f.post(otherPath, {
      locationId: f.location.id,
      requestKey: crypto.randomUUID(),
      address: 'Destinație client nou',
    });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await selectAddressCustomer(f);
    const book = draft.getByRole('region', { name: 'Adresele clientului', exact: true });
    await expect(book.getByText(address.address, { exact: true })).toBeVisible();
    await expect(book.getByRole('button', { name: 'Arhivează adresa', exact: true })).toHaveCount(
      0,
    );
    await expect(
      book.getByRole('button', { name: 'Salvează adresa în agendă', exact: true }),
    ).toHaveCount(0);
    await book.getByRole('button', { name: 'Selectează adresa', exact: true }).click();
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue(address.address);
    let held!: () => void;
    let done!: () => void;
    const requested = new Promise<void>((resolve) => {
      held = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      done = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await operator.route(`**/api/tenant${f.path}?*`, async (route) => {
      const result = await route.fetch();
      held();
      await gate;
      await route.fulfill({ response: result });
      done();
    });
    await book.getByRole('button', { name: 'Reîncarcă adresele', exact: true }).click();
    await requested;
    await draft.getByRole('button', { name: 'Folosește contact manual', exact: true }).click();
    await selectAddressCustomer(f, true);
    await expect(book.getByText('Destinație client nou', { exact: true })).toBeVisible();
    release!();
    await completed;
    await expect(book.getByText(address.address, { exact: true })).toHaveCount(0);
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue('');
    await operator.unroute(`**/api/tenant${f.path}?*`);
    let heldSecond!: () => void;
    let doneSecond!: () => void;
    const requestedSecond = new Promise<void>((resolve) => {
      heldSecond = resolve;
    });
    const completedSecond = new Promise<void>((resolve) => {
      doneSecond = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await operator.route(`**/api/tenant${otherPath}?*`, async (route) => {
      const result = await route.fetch();
      heldSecond();
      await secondGate;
      await route.fulfill({ response: result });
      doneSecond();
    });
    await book.getByRole('button', { name: 'Reîncarcă adresele', exact: true }).click();
    await requestedSecond;
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.secondLocation.id);
    release!();
    await completedSecond;
    await expect(draft.getByLabel('Telefonul clientului', { exact: true })).toHaveValue('');
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await expect(
      draft.getByRole('region', { name: 'Adresele clientului', exact: true }),
    ).toHaveCount(0);
    await expect(draft.getByLabel('Adresa completă', { exact: true })).toHaveValue('');
  } finally {
    release?.();
    await f.dispose();
  }
});
