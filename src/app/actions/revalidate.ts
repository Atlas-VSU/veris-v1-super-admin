"use server";

import { revalidatePath } from "next/cache";

/**
 * Busts the Next.js router cache for any page that renders org data
 * server-side. Call this after any mutation that adds or removes an org
 * so the Terms and Org Accounts pages see fresh data on the next visit.
 *
 * Why here and not in the firebase layer: `revalidatePath` is a Next.js
 * runtime API that must run in a Server Action context ("use server").
 */
export async function revalidateOrgPages() {
  revalidatePath("/super-admin/terms");
  revalidatePath("/super-admin/org-accounts");
  revalidatePath("/super-admin/organizations");
}

