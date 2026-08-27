import { useState, useMemo, useEffect } from "react";

/**
 * A centralized custom hook for client-side pagination.
 *
 * @param items The full array of filtered items to paginate.
 * @param itemsPerPage The maximum number of items to display per page (default: 10).
 * @param resetDependencies Array of filter/search values that should reset the page to 1 on change.
 */
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 10,
  resetDependencies: any[] = []
) {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page back to 1 if filter criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, resetDependencies);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  // Handle case where items are removed and currentPage exceeds totalPages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems,
  };
}
