import type { FormEvent, ReactNode } from 'react';
import type { createApi } from '../../../shared/api/client';
import type { Session, AuthenticationMethod } from '../../../shared/api/types';
export type AuthPlane = 'tenant' | 'platform';
export type AuthStage = 'login' | Session['stage'];
export type AuthOptions = { plane: AuthPlane; companySlug?: string };
export type AuthGateProps = AuthOptions & {
  children: (
    session: Session,
    api: ReturnType<typeof createApi>,
    logout: () => Promise<void>,
    invalidateRevoked: () => void,
  ) => ReactNode;
};
export type AuthController = {
  api: ReturnType<typeof createApi>;
  session: Session | null;
  loading: boolean;
  busy: boolean;
  loginMethod: AuthenticationMethod;
  setLoginMethod: (method: AuthenticationMethod) => void;
  error: string;
  secret: string;
  enrollmentUri: string;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  enroll: () => Promise<void>;
  logout: () => Promise<void>;
  invalidateRevoked: () => void;
};
export type AuthStoryProps = { plane: AuthPlane };
export type AuthCardProps = AuthOptions & {
  auth: AuthController;
  stage: AuthStage;
  wrongCompany: boolean;
};
export type AuthFormProps = AuthOptions & { auth: AuthController; stage: AuthStage };
export type SecurityFieldsProps = { auth: AuthController; stage: AuthStage };

export type EnrollmentResponse = { secret: string; otpauthUri: string };

export type LoginFieldsProps = AuthOptions & { auth: AuthController };
