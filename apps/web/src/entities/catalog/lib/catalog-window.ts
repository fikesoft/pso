import type { CatalogResponse } from '@pos/contracts';
export async function readCatalogWindow(
  load: (cursor?: string) => Promise<CatalogResponse>,
  depth: number,
) {
  const first = await load();
  const products = new Map(first.products.map((product) => [product.id, product]));
  let cursor = first.nextCursor;
  let pageDepth = 1;
  while (cursor && pageDepth < depth) {
    const page = await load(cursor);
    for (const product of page.products) {
      const previous = products.get(product.id);
      if (!previous || product.version >= previous.version) products.set(product.id, product);
    }
    cursor = page.nextCursor;
    pageDepth++;
  }
  return { ...first, products: [...products.values()], nextCursor: cursor };
}
