"use client";

import { useCallback, useEffect, useState } from "react";
import type { RosterSyncLogEntry } from "../types";

/**
 * Loads the record of past synchronizations.
 *
 * Kept separate from `useRosterSync` because the history is read whenever the
 * page opens, independently of whether an upload is in progress — and it must
 * survive a reset, which clears the whole sync state machine.
 */
/** Fetches the history. Pure I/O — sets no state, so both the mount effect and
 *  the manual refresh can own their own state transitions. */
async function fetchEntries(): Promise<RosterSyncLogEntry[]> {
  const res = await fetch("/api/roster-sync", { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

export function useSyncHistory() {
  const [entries, setEntries] = useState<RosterSyncLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Surfaced inline rather than as a toast — an unavailable history is
  // informational and must never read as a failed synchronization.
  const failed = (err: unknown) =>
    err instanceof Error ? err.message : "Could not load synchronization history.";

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await fetchEntries());
    } catch (err) {
      setError(failed(err));
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load is deliberately not `refresh()`: that would set state
  // synchronously inside the effect, and it has no way to stand down if the
  // page is left before the request settles.
  useEffect(() => {
    let cancelled = false;
    fetchEntries()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(failed(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { entries, isLoading, error, refresh };
}

/**
 * Firestore timestamps reach the client either as an ISO string or as a
 * `{ _seconds }` object depending on how the document was serialized, so both
 * shapes are handled rather than assuming one.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const seconds = (value as { _seconds?: unknown })._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  return null;
}
