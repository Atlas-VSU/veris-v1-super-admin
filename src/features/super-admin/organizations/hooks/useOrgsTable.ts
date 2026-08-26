import { useState, useMemo, useEffect, useRef } from "react";
import type { SuperAdminOrg, SuperAdminOrgAccount, OrgLevel, SubscriptionTier, SuperAdminFaculty, SuperAdminProgram, SortOption } from "@/features/super-admin/types";
import { createOrganization, fetchOrganizationsPaginated, updateOrganization } from "@/firebase/organizations";
import { getFaculties } from "@/firebase/faculties";
import { getPrograms } from "@/firebase/programs";
import { toast } from "sonner";
import { Organization } from "@/constants/types";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { CreateOrgFormData, EditOrgFormData } from "../types/dialogs.types";
import { batchUpdateAccounts, getAccountsByOrgId } from "@/firebase/accounts";
import { revalidateOrgPages } from "@/app/actions/revalidate";


interface useOrgsTableProps {
  itemsPerPage: number;
}

export function useOrgsTable({ itemsPerPage }: useOrgsTableProps) {
  const [accounts, setAccounts] = useState<SuperAdminOrgAccount[]>([]);
  const [localOrgs, setLocalOrgs] = useState<SuperAdminOrg[]>([]);
  const [faculties, setFaculties] = useState<SuperAdminFaculty[]>([]);
  const [programs, setPrograms] = useState<SuperAdminProgram[]>([]);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<OrgLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [tierFilter, setTierFilter] = useState<SubscriptionTier | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("date-newest");
  const [currentPage, setCurrentPage] = useState(1);
  const cursorRef = useRef<Record<number, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrg | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveTargetOrg, setArchiveTargetOrg] = useState<SuperAdminOrg | null>(null);
  const [totalOrgsCount, setTotalOrgsCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Uploads a file via the server-side /api/upload route (Admin SDK).
   * This bypasses Firebase App Check and client Storage rules entirely.
   */
  async function uploadFile(file: File, path: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", path);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error ?? "Upload failed");
    }
    const { url } = await res.json();
    return url;
  }


  useEffect(() => {
    async function loadData() {
      try {
        const [facList, progList] = await Promise.all([
          getFaculties(),
          getPrograms(),
        ]);
        setFaculties(facList);
        setPrograms(progList);
      } catch (error) {
        console.error("Error loading faculties or programs:", error);
      }
    }
    loadData();
  }, []);

  // Reset page to 1 when filters change
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const cursor = currentPage > 1 ? (cursorRef.current[currentPage - 2] ?? null) : null;

        const { results: fetchedDocs, totalCount, lastVisible, accounts, hasMore: apiHasMore } = await fetchOrganizationsPaginated(
          itemsPerPage,
          cursor,
          search,
          sortBy,
          levelFilter,
          statusFilter,
          tierFilter
        );

        // setOrgs(fetchedDocs);
        setAccounts(accounts);
        const restructuredOrgs = fetchedDocs.map((org) => ({
          ...org,
          facultyName: faculties.find((f) => f.id === org.facultyId)?.name || null,
          facultyAcronym: faculties.find((f) => f.id === org.facultyId)?.acronym || null,
          programName: programs.find((p) => p.id === org.programId)?.name || null,
          programAcronym: programs.find((p) => p.id === org.programId)?.acronym || null,
          level: org.accessLevel === 1 ? "department" : org.accessLevel === 2 ? "faculty" : "council",
          createdAt: org.metadata?.createdAt?.toDate
            ? org.metadata.createdAt.toDate().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            : null,
        } as unknown as SuperAdminOrg));

        setLocalOrgs(restructuredOrgs);
        setTotalOrgsCount(totalCount);
        setHasMore(apiHasMore ?? (fetchedDocs.length === itemsPerPage));
        if (lastVisible) {
          cursorRef.current[currentPage - 1] = lastVisible;
        }
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchData();

  }, [search, levelFilter, statusFilter, tierFilter, sortBy, currentPage]);

  const handleCreateOrg = async (orgData: CreateOrgFormData) => {
    try {
      const logoUrl = orgData.logoFile ?
        await uploadFile(orgData.logoFile, `org-logos/${orgData.shortName} LOGO-${Date.now()}`) : null;
      const treasurerQrUrl = orgData.treasurerQrFile ?
        await uploadFile(orgData.treasurerQrFile, `org-qrs/${orgData.shortName} TREASURER-${Date.now()}`) : null;
      const auditorQrUrl = orgData.auditorQrFile ?
        await uploadFile(orgData.auditorQrFile, `org-qrs/${orgData.shortName} AUDITOR-${Date.now()}`) : null;
      const newId = await createOrganization(orgData, logoUrl, treasurerQrUrl, auditorQrUrl);

      const newOrg: SuperAdminOrg = {
        id: newId,
        name: orgData.name,
        shortName: orgData.shortName,
        level: orgData.level,
        facultyId: orgData.facultyId,
        facultyName: orgData.facultyName,
        facultyAcronym: orgData.facultyAcronym,
        programId: orgData.programId,
        programName: orgData.programName,
        programAcronym: orgData.programAcronym,
        isArchived: false,
        subscribed: false,
        subscriptionTier: null,
        adviser: orgData.adviser,
        president: orgData.president,
        orgAuditorName: orgData.auditor,
        orgAuditorNumber: orgData.auditorNumber,
        orgAuditorUrl: auditorQrUrl,
        orgLogoUrl: logoUrl,
        orgTreasurerName: orgData.treasurer,
        orgTreasurerNumber: orgData.treasurerNumber,
        orgTreasurerUrl: treasurerQrUrl,
        contactEmail: orgData.contactEmail,
        description: orgData.description,
        createdAt: new Date().toISOString().split("T")[0],
      };

      setLocalOrgs((prev) => [newOrg, ...prev]);
      await revalidateOrgPages();
      toast.success(`Organization "${newOrg.name}" has been created!`);
    } catch (err) {
      toast.error(`Failed to create organization.${err}`);
    }
  };

  const handleEditOrg = async (
    orgId: string,
    orgData: EditOrgFormData
  ) => {
    try {
      const logoUrl = orgData.logoFile && orgData.changedLogo ?
        await uploadFile(orgData.logoFile, `org-logos/${orgData.shortName} LOGO-${Date.now()}`)
        : orgData.removeLogo ? null : orgData.existingLogoUrl || null;

      const treasurerQrUrl = orgData.treasurerQrFile && orgData.changedTreasurerQr ?
        await uploadFile(orgData.treasurerQrFile, `org-qrs/${orgData.shortName} TREASURER-${Date.now()}`)
        : orgData.removeTreasurerQr ? null : orgData.existingTreasurerQrUrl || null;

      const auditorQrUrl = orgData.auditorQrFile && orgData.changedAuditorQr ?
        await uploadFile(orgData.auditorQrFile, `org-qrs/${orgData.shortName} AUDITOR-${Date.now()}`)
        : orgData.removeAuditorQr ? null : orgData.existingAuditorQrUrl || null;

      await updateOrganization(orgId, {
        name: orgData.name,
        shortName: orgData.shortName,
        accessLevel: orgData.level === "department" ? 1 : orgData.level === "faculty" ? 2 : 3,
        adviser: orgData.adviser,
        president: orgData.president,
        contactEmail: orgData.contactEmail,
        description: orgData.description,
        facultyId: orgData.facultyId || null,
        programId: orgData.programId || null,
        orgAuditorName: orgData.auditor,
        orgAuditorNumber: orgData.auditorNumber,
        orgAuditorUrl: auditorQrUrl,
        orgTreasurerName: orgData.treasurer,
        orgTreasurerNumber: orgData.treasurerNumber,
        orgTreasurerUrl: treasurerQrUrl,
        orgLogoUrl: logoUrl,
        metadata: {
          updatedAt: new Date(),
        },

      });

      setLocalOrgs((prev) =>
        prev.map((org) => {
          if (org.id === orgId) {
            const updated = {
              ...org,
              ...orgData,
            };
            if (selectedOrg && selectedOrg.id === orgId) {
              setSelectedOrg(updated);
            }
            return updated;
          }
          return org;
        })
      );
      toast.success("Organization details updated successfully!");
      await revalidateOrgPages();
    } catch (err) {
      toast.error("Failed to update organization.");
    }
  };

  const handleToggleArchiveConfirm = (org: SuperAdminOrg) => {
    setArchiveTargetOrg(org);
    setArchiveConfirmOpen(true);
  };

  const handleToggleArchiveSubmit = async () => {
    if (!archiveTargetOrg) return;

    try {
      const nextArchiveState = !archiveTargetOrg.isArchived;
      await updateOrganization(archiveTargetOrg.id, {
        isArchived: nextArchiveState,
      });
      const accounts = await getAccountsByOrgId(archiveTargetOrg.id);
      await batchUpdateAccounts(accounts, { isActive: !nextArchiveState, isDeleted: nextArchiveState });

      setLocalOrgs((prev) =>
        prev.map((org) => {
          if (org.id === archiveTargetOrg.id) {
            const updated = {
              ...org,
              isArchived: nextArchiveState,
            };
            if (selectedOrg && selectedOrg.id === org.id) {
              setSelectedOrg(updated);
            }
            return updated;
          }
          return org;
        })
      );

      const actionText = nextArchiveState ? "archived" : "reactivated";
      toast.success(`Organization "${archiveTargetOrg.name}" has been ${actionText}.`);
      setArchiveConfirmOpen(false);
      await revalidateOrgPages();
    } catch (err) {
      toast.error("Failed to update organization archive status.");
    }
  };

  // const filteredAndSortedOrgs = useMemo(() => {
  //   let result = localOrgs.filter((org) => {
  //     if (search.trim()) {
  //       const q = search.toLowerCase();
  //       const matchesName = org.name.toLowerCase().includes(q) || org.shortName.toLowerCase().includes(q);
  //       const matchesAcronym = org.facultyAcronym?.toLowerCase().includes(q) || org.programAcronym?.toLowerCase().includes(q);
  //       const matchesAdviser = org.adviser?.toLowerCase().includes(q);
  //       if (!matchesName && !matchesAcronym && !matchesAdviser) return false;
  //     }

  //     if (levelFilter !== "all" && org.level !== levelFilter) return false;

  //     if (statusFilter !== "all") {
  //       if (statusFilter === "archived" && !org.isArchived) return false;
  //       if (statusFilter === "active" && (org.isArchived || !org.subscribed)) return false;
  //       if (statusFilter === "inactive" && (org.isArchived || org.subscribed)) return false;
  //     }

  //     if (tierFilter !== "all" && org.subscriptionTier !== tierFilter) return false;

  //     return true;
  //   });

  //   result.sort((a, b) => {
  //     if (sortBy === "name-asc") return a.name.localeCompare(b.name);
  //     if (sortBy === "name-desc") return b.name.localeCompare(a.name);
  //     if (sortBy === "date-newest") {
  //       return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  //     }
  //     if (sortBy === "date-oldest") {
  //       return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  //     }
  //     return 0;
  //   });

  //   return result;
  // }, [localOrgs, search, levelFilter, statusFilter, tierFilter, sortBy]);

  const totalPages = hasMore
    ? Math.max(currentPage + 1, Math.ceil(totalOrgsCount / itemsPerPage))
    : currentPage;
  // const paginatedOrgs = useMemo(() => {
  //   const startIndex = (currentPage - 1) * itemsPerPage;
  //   return filteredAndSortedOrgs.slice(startIndex, startIndex + itemsPerPage);
  // }, [filteredAndSortedOrgs, currentPage]);

  return {
    accounts,
    localOrgs,
    search,
    setSearch,
    levelFilter,
    setLevelFilter,
    statusFilter,
    setStatusFilter,
    tierFilter,
    setTierFilter,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    selectedOrg,
    setSelectedOrg,
    sheetOpen,
    setSheetOpen,
    createOpen,
    setCreateOpen,
    editOpen,
    setEditOpen,
    archiveConfirmOpen,
    setArchiveConfirmOpen,
    archiveTargetOrg,
    totalPages,
    handleCreateOrg,
    handleEditOrg,
    handleToggleArchiveConfirm,
    handleToggleArchiveSubmit,
    itemsPerPage,
    faculties,
    programs,
    totalOrgsCount,
  };
}
