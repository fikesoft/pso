import type { CatalogProduct } from '../catalog';
export interface UpsellRuleDto {
  id: string;
  locationId: string;
  sourceProductId: string;
  sourceProductName: string;
  targetProductId: string;
  targetProductName: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}
export interface UpsellRulesResponse {
  rules: UpsellRuleDto[];
  nextCursor: string | null;
}
export interface UpsellSuggestion {
  ruleId: string;
  ruleVersion: number;
  sourceProductId: string;
  target: CatalogProduct;
}
export interface UpsellSuggestionsResponse {
  suggestions: UpsellSuggestion[];
}
import type { z } from 'zod';
import type {
  createUpsellRuleSchema,
  updateUpsellRuleSchema,
  showUpsellOfferSchema,
} from './upsell.schema';
export type CreateUpsellRule = z.infer<typeof createUpsellRuleSchema>;
export type UpdateUpsellRule = z.infer<typeof updateUpsellRuleSchema>;
export type ShowUpsellOffer = z.infer<typeof showUpsellOfferSchema>;
export interface UpsellOfferDto {
  id: string;
  ruleId: string;
  ruleVersion: number;
  targetProductId: string;
  shownAt: string;
  acceptedAt: string | null;
}
export interface UpsellRuleMetrics {
  ruleId: string;
  shown: string;
  accepted: string;
  conversionPercent: string;
  revenue: string | null;
}
export interface UpsellMetricsResponse {
  metrics: UpsellRuleMetrics[];
  currency: 'MDL';
}
