/**
 * Server-side data fetching for the Super Admin dashboard.
 * Uses Firebase Admin SDK (adminDb) — runs ONLY on the server.
 * All Timestamps are converted to ISO strings before returning.
 * No write operations are performed.
 */

import { adminDb } from "@/firebase/firebase-admin.config";
import type {
  SuperAdminOrg,
  SuperAdminOrgAccount,
  SuperAdminFaculty,
  SuperAdminProgram,
  DashboardStats,
  SuperAdminPageData,
  SubscriptionTier,
  OrgLevel,
} from "@/features/super-admin/types";
import { toISOString } from "@/utils/dateUtils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Faculties ────────────────────────────────────────────────────────────────

export async function fetchFaculties(): Promise<SuperAdminFaculty[]> {
  const snap = await adminDb.collection("faculties").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? "",
      acronym: d.acronym ?? "",
    };
  });
}

// ─── Programs ─────────────────────────────────────────────────────────────────

export async function fetchPrograms(): Promise<SuperAdminProgram[]> {
  const snap = await adminDb.collection("programs").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? "",
      acronym: d.acronym ?? "",
      facultyId: d.facultyId ?? "",
    };
  });
}

// ─── Organizations ────────────────────────────────────────────────────────────

export async function fetchOrganizations(
  facultyMap: Map<string, SuperAdminFaculty>,
  programMap: Map<string, SuperAdminProgram>
): Promise<SuperAdminOrg[]> {
  const snap = await adminDb.collection("organizations").where("isArchived", "!=", true).get();
  return snap.docs.map((doc) => {
    const d = doc.data();

    const facultyId: string | null = d.facultyId ?? null;
    const programId: string | null = d.programId ?? null;

    const faculty = facultyId ? facultyMap.get(facultyId) ?? null : null;
    const program = programId ? programMap.get(programId) ?? null : null;


    return {
      id: doc.id,
      name: d.name ?? "",
      shortName: d.shortName ?? "",
      level: d.accessLevel === 1 ? "department" : d.accessLevel === 2 ? "faculty" : "council",
      facultyId: facultyId,
      facultyName: faculty?.name ?? null,
      facultyAcronym: faculty?.acronym ?? null,
      programId: programId,
      programName: program?.name ?? null,
      programAcronym: program?.acronym ?? null,
      isArchived: d.isArchived ?? d.isArchived ?? false,
      subscribed: d.subscribed ?? false,
      subscriptionTier: (d.subscriptionTier ?? null) as SubscriptionTier | null,
    };
  });
}

// ─── Org Accounts ─────────────────────────────────────────────────────────────

export async function fetchOrgAccounts(
  orgMap: Map<string, SuperAdminOrg>
): Promise<SuperAdminOrgAccount[]> {
  const snap = await adminDb.collection("users").where("role", "==", "admin").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const orgId: string = d.orgId ?? "";
    const org = orgId ? orgMap.get(orgId) ?? null : null;

    return {
      id: doc.id,
      orgId: orgId,
      orgName: org?.name ?? null,
      positionName: d.name ?? "",
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      fullName: (`${d.firstName ?? ""} ${d.lastName ?? ""}`.trim()) || "Admin User",
      email: d.email ?? "",
      isActive: d.isActive ?? d.isActive ?? true,
      isDeleted: d.isDeleted ?? false,
      createdAt: toISOString(d.createdAt),
    };
  });
}

// ─── Aggregate Stats ──────────────────────────────────────────────────────────

export function computeStats(
  orgs: SuperAdminOrg[],
  accounts: SuperAdminOrgAccount[]
): DashboardStats {
  const subscribedOrgs = orgs.filter((o) => o.subscribed);
  const tierCounts = { basic: 0, plus: 0, premium: 0 };
  for (const org of subscribedOrgs) {
    if (org.subscriptionTier === "basic") tierCounts.basic++;
    else if (org.subscriptionTier === "plus") tierCounts.plus++;
    else if (org.subscriptionTier === "premium") tierCounts.premium++;
  }

  return {
    totalOrgs: orgs.length,
    totalSubscribed: subscribedOrgs.length,
    tierCounts: tierCounts,
    totalActiveAccounts: accounts.filter(
      (a) => a.isActive && !a.isDeleted
    ).length,
    totalArchived: orgs.filter((o) => o.isArchived).length,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Fetches ALL super admin data in parallel and returns fully resolved,
 * serializable objects. Safe to call from Server Components / Server Actions.
 */
export async function fetchSuperAdminData(): Promise<SuperAdminPageData> {
  // Fetch faculties and programs first (needed to resolve org references)
  const [faculties, programs] = await Promise.all([
    fetchFaculties(),
    fetchPrograms(),
  ]);

  const facultyMap = new Map(faculties.map((f) => [f.id, f]));
  const programMap = new Map(programs.map((p) => [p.id, p]));

  // Fetch orgs (needs faculty/program maps for resolution)
  const orgs = await fetchOrganizations(facultyMap, programMap);
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  // Fetch accounts (needs org map for resolution)
  const accounts = await fetchOrgAccounts(orgMap);

  const stats = computeStats(orgs, accounts);

  return { orgs, accounts, stats };
}
