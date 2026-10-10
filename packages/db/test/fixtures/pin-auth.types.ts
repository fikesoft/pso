import type { createPinAuthFixture } from './pin-auth.fixture';

export type PinAuthFixture = Awaited<ReturnType<typeof createPinAuthFixture>>;
export type PinLookupResult = {
  result: null | {
    user: {
      id: string;
      organizationId: string;
      authenticationMethod: string;
      pinLookup: string | null;
      pinHash: string | null;
    };
    organization: { id: string };
    session?: { authenticationMethod: string };
  };
};
export type PinFunctionPrivileges = {
  owner: string;
  securityDefiner: boolean;
  settings: string[];
  authExecute: boolean;
  runtimeExecute: boolean;
  platformExecute: boolean;
  internalCreate: boolean;
};
