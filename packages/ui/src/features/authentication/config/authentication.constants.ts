import { roMessages } from '../../../shared/i18n';
export const AUTH_STAGE_MESSAGES = {
  login: { title: roMessages.message401, description: roMessages.message406 },
  password: { title: roMessages.message398, description: roMessages.message403 },
  enroll: { title: roMessages.message399, description: roMessages.message404 },
  mfa: { title: roMessages.message400, description: roMessages.message405 },
  ready: { title: roMessages.message401, description: roMessages.message406 },
} as const;
export const MINIMUM_PASSWORD_LENGTH = 12;
export const MFA_CODE_LENGTH = 6;
