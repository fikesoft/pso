import { REPEAT_PRODUCT_BLOCKERS } from '../config/order-repeat.constants';
import type { CatalogProduct, OrderRepeatPreviewResponse } from '@pos/contracts';
import type { ModifierChoices } from '../../../entities/modifier';
import { previewProductModifiers } from '../../../entities/modifier';
import { newDraftLine } from './draft-line';
import type { RepeatRow } from '../model/order-repeat.types';
export function repeatProductAvailable(product: CatalogProduct | null): product is CatalogProduct {
  return (
    !!product &&
    product.status === 'ACTIVE' &&
    product.enabled &&
    product.price !== null &&
    product.locationVersion !== null &&
    product.scheduleAvailability?.available !== false
  );
}
export function canRepairRepeatRow(row: RepeatRow) {
  return (
    repeatProductAvailable(row.product) &&
    !row.line.issues.some((issue) => issue.blocking && REPEAT_PRODUCT_BLOCKERS.includes(issue.code))
  );
}
export function repairRepeatRow(row: RepeatRow, choices: ModifierChoices): RepeatRow {
  if (!canRepairRepeatRow(row) || !row.product) return row;
  const preview = previewProductModifiers(row.product, choices);
  if (!preview.valid) return row;
  return {
    ...row,
    draft: {
      ...newDraftLine(row.product, preview),
      quantity: row.line.historical.quantity,
      courseNumber: row.line.historical.courseNumber ?? 0,
      note: row.line.historical.note ?? '',
    },
  };
}
export function prepareRepeatRows(response: OrderRepeatPreviewResponse): RepeatRow[] {
  return response.lines.map((line) => {
    const row: RepeatRow = {
      line,
      product: response.products.find((product) => product.id === line.productId) ?? null,
      draft: null,
      removed: false,
    };
    if (
      !line.candidate ||
      line.issues.some((issue) => issue.blocking) ||
      line.candidate.productId !== line.productId
    )
      return row;
    const choices = Object.fromEntries(
      (line.candidate.modifiers ?? []).map((selection) => [
        selection.bindingId,
        selection.optionIds,
      ]),
    );
    return repairRepeatRow(row, choices);
  });
}
export function transferableRepeatLines(rows: RepeatRow[]) {
  const included = rows.filter((row) => !row.removed);
  if (!included.length || included.some((row) => !row.draft)) return null;
  return included.map((row) => row.draft!);
}
