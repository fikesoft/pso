import type { AuthenticationMethod } from '@pos/ui/types';
export interface IssuedCredential {
  kind: AuthenticationMethod;
  value: string;
}
export interface CredentialProps {
  credential: IssuedCredential;
  onDismiss: () => void;
}
