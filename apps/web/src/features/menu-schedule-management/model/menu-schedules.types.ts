import type { Api } from '../../../shared/api';
import type { useMenuSchedules } from './use-menu-schedules';
import type { MenuSchedule } from '@pos/contracts';

export interface MenuScheduleManagementProps {
  api: Api;
  locationId: string;
  locationName: string;
}
export type MenuSchedulesModel = ReturnType<typeof useMenuSchedules>;
export interface ScheduleDialogProps extends MenuScheduleManagementProps {
  model: MenuSchedulesModel;
}
export interface ScheduleProductsProps extends MenuScheduleManagementProps {
  schedule: MenuSchedule | null;
}
export interface ScheduleFieldsProps {
  schedule: MenuSchedule | null;
}
