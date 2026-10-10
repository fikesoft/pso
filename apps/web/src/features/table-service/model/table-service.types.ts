import type { DiningTableDto, TableVisitDetailResponse } from '@pos/contracts/tables';
import type { TableAccessProps, TableOperationModel } from '../../../entities/table';
export interface TableServiceProps extends TableAccessProps {
  blocked: boolean;
  refreshToken: number;
  onCompose: (context: { visitId: string; tableLabel: string }) => void;
  onOrder: (id: string) => void;
  onBill: (visitId: string) => void;
}
export type TableEdit = { kind: 'CREATE' } | { kind: 'UPDATE' | 'ARCHIVE'; table: DiningTableDto };
export interface TableConfigurationProps extends TableAccessProps {
  onBack: () => void;
}
export interface TableFormProps {
  edit: TableEdit;
  locationId: string;
  operation: TableOperationModel;
  onClose: () => void;
}
export interface VisitPanelProps extends TableServiceProps {
  onVisit: (id: string) => void;
  id: string;
  onBack: () => void;
}
export interface VisitActionsProps extends TableAccessProps {
  detail: TableVisitDetailResponse;
  operation: TableOperationModel;
  blocked: boolean;
}
export interface TableRecoveryProps {
  operation: TableOperationModel;
  onRefresh: () => void;
}
export interface TableMapProps extends TableServiceProps {
  onSelect: (id: string) => void;
}
