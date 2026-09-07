import { MAX_DEACTIVATION_RATIO, MIN_DEACTIVATIONS_FOR_RATIO_CHECK } from "../const";

/**
 * Decides whether a run would retire an implausible share of the student body.
 *
 * The roster is the whole university, so a file that is merely incomplete — one
 * college's export, a sheet that lost rows in conversion — looks identical to a
 * mass graduation: every student it omits is read as departed. This is the
 * likeliest operator error and the one with the widest blast radius, so a run
 * over the threshold is refused unless it is explicitly acknowledged.
 *
 * Two conditions must both hold, because a ratio alone misfires on small data:
 * five departures out of eight students is 62% and entirely ordinary.
 *
 * Pure and dependency-free so the threshold can be exercised directly.
 */
export function exceedsDeactivationThreshold(
  deactivateCount: number,
  activeStudentCount: number
): boolean {
  if (deactivateCount <= MIN_DEACTIVATIONS_FOR_RATIO_CHECK) return false;
  if (activeStudentCount <= 0) return false;
  return deactivateCount / activeStudentCount > MAX_DEACTIVATION_RATIO;
}

/** Share of the active student body a run would retire, as a 0–1 ratio. */
export function deactivationRatio(deactivateCount: number, activeStudentCount: number): number {
  if (activeStudentCount <= 0) return 0;
  return deactivateCount / activeStudentCount;
}
