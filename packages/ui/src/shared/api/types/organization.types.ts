import type { BusinessHoursWindow } from '@pos/contracts';
export type { Brand, BusinessHoursWindow } from '@pos/contracts';
export type Organization = {
  id: string;
  name: string;
  slug: string;
  status?: string;
  timezone?: string;
  locale?: string;
};
export type Location = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  timezone?: string;
  brandId?: string | null;
  phone?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  businessHours?: BusinessHoursWindow[];
  status: string;
  version: number;
};
