export type ProductStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT';

export function productListQuery({
  page,
  limit,
  search,
  categoryId,
  status,
}: {
  page: number;
  limit: number;
  search: string;
  categoryId: string;
  status: ProductStatusFilter;
}): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
  if (search.trim()) params.set('search', search.trim());
  if (categoryId) params.set('categoryId', categoryId);
  return `?${params.toString()}`;
}
