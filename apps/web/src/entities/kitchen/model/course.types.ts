import type { FireKitchenCourseInput, ResolveKitchenCourseInput } from '@pos/contracts';
import type { Api } from '../../../shared/api';

export interface CoursePointerScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface CoursePointer extends CoursePointerScope {
  command: ResolveKitchenCourseInput;
}
export interface CourseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface CourseAttempt extends FireKitchenCourseInput {
  ticketId: string;
}
export interface CourseOperationInput extends CoursePointerScope {
  api: Api;
  canFire: boolean;
  onSaved: () => Promise<void>;
}
