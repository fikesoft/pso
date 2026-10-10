import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const observedContexts = new WeakSet<BrowserContext>();
const errors: string[] = [];

export function observeRuntimeErrors(context: BrowserContext) {
  if (observedContexts.has(context)) return;
  observedContexts.add(context);
  const observePage = (page: Page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        ['error', 'warning'].includes(message.type()) &&
        !message.text().startsWith('Failed to load resource:')
      )
        errors.push(message.text());
    });
  };
  for (const page of context.pages()) observePage(page);
  context.on('page', observePage);
}

export function assertNoRuntimeErrors() {
  const captured = errors.splice(0);
  expect(captured, 'Browserul nu trebuie să emită excepții JavaScript necontrolate').toEqual([]);
}
