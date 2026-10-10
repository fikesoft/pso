import type { FormEvent } from 'react';
import type { PlatformApi } from '../../../shared/model/api.types';
export type ProvisionedCredential = { password: string; slug: string; login: string };
export type ProvisionOrganizationOptions = { api: PlatformApi; onCreated: () => Promise<void> };
export type ProvisionOrganizationInput = {
  name: FormDataEntryValue | null;
  slug: FormDataEntryValue | null;
  legalName: FormDataEntryValue | null;
  adminLogin: FormDataEntryValue | null;
  adminDisplayName: FormDataEntryValue | null;
  password?: FormDataEntryValue;
};
export type ProvisionOrganizationController = {
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
  error: string;
  credential: ProvisionedCredential | null;
  dismissCredential: () => void;
  start: () => void;
  create: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};
export type ProvisionOrganizationModalProps = { controller: ProvisionOrganizationController };
export type ProvisionedCredentialProps = {
  credential: ProvisionedCredential;
  onDismiss: () => void;
};
