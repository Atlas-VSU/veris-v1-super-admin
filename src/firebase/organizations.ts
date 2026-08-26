import type { OrgLevel, SuperAdminOrgAccount } from "@/features/super-admin/types";
import { addDoc, collection, doc, getCountFromServer, getDocs, limit, orderBy, query, startAfter, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase.config";
import { getOrgAccounts } from "./accounts";
import type { CreateOrgFormData } from "@/features/super-admin/organizations/types/dialogs.types";



const orgCollection = collection(db, "organizations");

export async function createOrganization(orgData: CreateOrgFormData, logoUrl: string | null, treasurerQrUrl: string | null, auditorQrUrl: string | null): Promise<string> {

  try {
    let level = 1;
    if (orgData.level === "faculty") level = 2;
    else if (orgData.level === "council") level = 3;

    console.log("Creating organization with data:", orgData, "and level:", level);
    const newOrg = {
      accessLevel: level,
      facultyId: orgData.facultyId && level === 2? orgData.facultyId : null,
      isArchived: false,
      name: orgData.name,
      adviser: orgData.adviser,
      president: orgData.president,
      contactEmail: orgData.contactEmail,
      description: orgData.description,
      orgAuditorName: orgData.auditor,
      orgAuditorNumber: orgData.auditorNumber,
      orgAuditorUrl: auditorQrUrl,
      orgLogoUrl: logoUrl,
      orgTreasurerName: orgData.treasurer,
      orgTreasurerNumber: orgData.treasurerNumber,
      orgTreasurerUrl: treasurerQrUrl,
      programId: orgData.programId && level === 1? orgData.programId : null,
      shortName: orgData.shortName,
      subscribed: false,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    };
    const newDocRef = await addDoc(orgCollection, newOrg);
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating organization:", error);
    throw error;
   }
}

export async function updateOrganization(orgId: string, orgData: any): Promise<void> {
  try {
    const orgDocRef = doc(orgCollection, orgId);
    await updateDoc(orgDocRef, orgData);
  } catch (error) {
    console.error("Error updating organization:", error);
    throw error;
   }

}


export const fetchOrganizationsPaginated = async (
  pageSize: number = 10,
  lastVisibleDoc: any = null,
  searchTerm: string = "",
  sortBy: string = "name-asc",
  lvlFilter: string = "3",
  statFilter: string = "all",
  tierFilter: string = "all",
) => {
  let constraints: any[] = []; 
  if (statFilter !== "all") {
    if (statFilter === "archived") {
      constraints.push(where("isArchived", "==", true));
    }
    if (statFilter === "active") {
      // Use != true so docs where isArchived is missing/undefined are included
      constraints.push(where("isArchived", "!=", true), where("subscribed", "==", true));
    }
    if (statFilter === "inactive") {
      constraints.push(where("isArchived", "!=", true), where("subscribed", "==", false));
    }
  }
  
  if (sortBy === "name-asc") {
    constraints.push(orderBy("name", "asc"));
  }
  if (sortBy === "name-desc") {
    constraints.push(orderBy("name", "desc"));
  }
  if (sortBy === "date-newest") { 
    constraints.push(orderBy("metadata.updatedAt", "desc"));
  }
  if (sortBy === "date-oldest") { 
    constraints.push(orderBy("metadata.updatedAt", "asc"));
  }
  if (lvlFilter !== "all") {
    if (lvlFilter === "department") {
    constraints.push(where("accessLevel", "==", 1));
  }
  if (lvlFilter === "faculty") {
    constraints.push(where("accessLevel", "==", 2));
  }
  if (lvlFilter === "council") {
    constraints.push(where("accessLevel", "==", 3));
  }
}
  
  if (tierFilter !== "all") {
    if (tierFilter === "basic") {
      constraints.push(where("subscriptionTier", "==", "basic"));
    }
    if (tierFilter === "plus") {
      constraints.push(where("subscriptionTier", "==", "plus"));
    }
    if (tierFilter === "premium") {
      constraints.push(where("subscriptionTier", "==", "premium"));
    }
   }


  // Build the count query WITHOUT limit/startAfter so it reflects the full result set
  const countQuery = query(orgCollection, ...constraints);

  // Now add paging constraints for the data fetch
  const pageConstraints = [...constraints, limit(pageSize)];
  if (lastVisibleDoc) {
    pageConstraints.push(startAfter(lastVisibleDoc));
  }

  let results: any[] = [];
  let totalCount = 0;
  let lastDoc: any = null;
  const rawSearch = searchTerm.trim();
  if (searchTerm && rawSearch !== "") {

    const qName = query(orgCollection, ...pageConstraints,
      where("name", ">=", rawSearch),
      where("name", "<=", rawSearch + "\uf8ff")
    );

    const qShortName = query(orgCollection, ...pageConstraints,
      where("shortName", ">=", rawSearch),
      where("shortName", "<=", rawSearch + "\uf8ff")
    );
    try {
      const [nameSnap, shortNameSnap] = await Promise.all([getDocs(qName), getDocs(qShortName)]);

      const resultsMap = new Map();

      nameSnap.forEach(doc => resultsMap.set(doc.id, doc));
      shortNameSnap.forEach(doc => resultsMap.set(doc.id, doc));
      const snaps = Array.from(resultsMap.values());
      results = snaps.map(doc => ({ id: doc.id, ...doc.data() }));
      totalCount = results.length;
      lastDoc = snaps.length > 0 ? snaps[snaps.length - 1] : null;
    } catch (error) {
      console.error("Error fetching organizations with search:", error);
      results = [];
    }

  }
  else {
    try {
      const q = query(orgCollection, ...pageConstraints);
      const [snap, countSnap] = await Promise.all([
        getDocs(q),
        getCountFromServer(countQuery),
      ]);
      results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      totalCount = countSnap.data().count;
      lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    } catch (error) {
      console.error("Error fetching organizations:", error);
      results = [];
    }

  }
  let accounts : SuperAdminOrgAccount[] = [];
  try {
      const orgMap = new Map(results.map((o) => [o.id, o]));
    // Fetch accounts (needs org map for resolution)
      accounts = await getOrgAccounts(orgMap);
  }catch (error) {
    console.error("Error fetching organization accounts:", error);
  }


  return {
    results,
    totalCount,
    lastVisible: lastDoc,
    accounts,
    hasMore: results.length === pageSize,
  }
}
  
