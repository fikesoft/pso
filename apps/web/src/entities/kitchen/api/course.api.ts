import type {
  KitchenCourseResolution,
  KitchenCourseResult,
  ResolveKitchenCourseInput,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { CourseAttempt } from '../model/course.types';

export async function sendCourse(api: Api, attempt: CourseAttempt) {
  const { ticketId, ...body } = attempt;
  return (
    await api.http.post<{ result: KitchenCourseResult }>(`/kitchen/tickets/${ticketId}/fire`, body)
  ).data;
}
export async function resolveCourse(api: Api, command: ResolveKitchenCourseInput) {
  return (
    await api.http.post<KitchenCourseResolution>('/kitchen-course-commands/resolution', command)
  ).data;
}
