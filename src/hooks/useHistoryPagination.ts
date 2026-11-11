import { useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type HistoryQuery = typeof api.bills.listBillsPage | typeof api.payments.listPaymentsPage;

// Joined search/date filters can yield an empty raw page. Keep following the
// cursor until the requested number of matches is found, or history is exhausted.
export function useHistoryPagination<Query extends HistoryQuery>(
  query: Query,
  args: Parameters<typeof usePaginatedQuery<Query>>[1],
) {
  const { results, status, loadMore } = usePaginatedQuery(query, args, { initialNumItems: 30 });
  const [target, setTarget] = useState(30);
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < target) loadMore(30);
  }, [status, results.length, target, loadMore]);
  return {
    results,
    exhausted: status === "Exhausted",
    loading: status === "LoadingFirstPage" || status === "LoadingMore" ||
      (status === "CanLoadMore" && results.length < target),
    loadMore: () => setTarget(results.length + 30),
  };
}
