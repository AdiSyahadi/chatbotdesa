/**
 * Pagination utility with validation and bounds checking
 * Prevents data dumps (limit=999999) and invalid inputs (page=-1, limit=NaN)
 */

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(
  query: { page?: string; limit?: string },
  options: { maxLimit?: number; defaultLimit?: number } = {}
): PaginationParams {
  const { maxLimit = 100, defaultLimit = 20 } = options;

  let page = parseInt(query.page || '1', 10);
  let limit = parseInt(query.limit || String(defaultLimit), 10);

  // NaN protection
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;

  // Cap maximum limit to prevent data dumps
  limit = Math.min(limit, maxLimit);

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}
