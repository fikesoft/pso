import type { Brand } from '@pos/ui/types';
import type { Api } from '../../../shared/api';

export interface BrandManagementProps {
  api: Api;
  canManage: boolean;
}
export interface BrandFormProps {
  api: Api;
  brand: Brand | null;
  onSaved: () => void;
}
export interface BrandRequest {
  name: string;
  code?: string;
  status?: 'ACTIVE' | 'DISABLED';
  version?: number;
}
