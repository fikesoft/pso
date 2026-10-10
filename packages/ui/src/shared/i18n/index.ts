import { commonMessages } from './common.ro';
import { kitchenDemoMessages } from './kitchen-demo.ro';
import { posDemoMessages } from './pos-demo.ro';
import { accessMessages } from './access.ro';
import { formsMessages } from './forms.ro';
import { workspaceMessages } from './workspace.ro';
import { platformMessages } from './platform.ro';
import { authenticationMessages } from './authentication.ro';

export const roMessages = {
  ...commonMessages,
  ...kitchenDemoMessages,
  ...posDemoMessages,
  ...accessMessages,
  ...formsMessages,
  ...workspaceMessages,
  ...platformMessages,
  ...authenticationMessages,
} as const;

export function formatMessage(template: string, ...values: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}

export { pinMessages } from './pin.ro';
export { sessionMessages } from './sessions.ro';
