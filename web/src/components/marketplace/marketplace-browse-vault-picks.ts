/**
 * The curated "Vault picks" rail is only ever meant to appear on the true default, unfiltered
 * first page — once a shopper is searching/filtering, or has paginated past page 1 via "Load
 * more", mixing in the curated rail on top of the loaded-so-far results would be misleading (it
 * wouldn't reflect the full filtered set, and would keep growing/reappearing as more pages load).
 *
 * Both conditions are required: `noFiltersActive` alone is not enough, since "Load more" appends
 * pages while filters stay cleared.
 */
export function shouldShowVaultPicksRail(noFiltersActive: boolean, page: number): boolean {
  return noFiltersActive && page === 1;
}
