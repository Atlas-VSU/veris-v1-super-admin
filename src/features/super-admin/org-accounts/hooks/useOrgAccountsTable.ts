import { useState, useMemo, useEffect } from "react";
import type { SuperAdminOrgAccount, SuperAdminOrg, OrgLevel } from "@/features/super-admin/types";
import type { EditAccountFormData } from "../types/dialogs.types";
import { updateAccount } from "@/firebase/accounts";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";

export function useOrgAccountsTable(accounts: SuperAdminOrgAccount[], orgs: SuperAdminOrg[]) {
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [deletedFilter, setDeletedFilter] = useState<"all" | "notDeleted" | "deleted">("all");
  const [levelFilter, setLevelFilter] = useState<OrgLevel | "all">("all");
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<SuperAdminOrgAccount | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const orgMap = useMemo(
    () => new Map(orgs.map((o) => [o.id, o])),
    [orgs]
  );

  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  // Compute unique faculties from orgs list
  const faculties = useMemo(() => {
    const map = new Map<string, { id: string; name: string; acronym: string }>();
    orgs.forEach((org) => {
      if (org.facultyId && org.facultyName) {
        map.set(org.facultyId, {
          id: org.facultyId,
          name: org.facultyName,
          acronym: org.facultyAcronym || "",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs]);

  // Filter organizations shown in the select dropdown based on level and faculty filters
  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      if (levelFilter !== "all" && org.level !== levelFilter) return false;
      if (facultyFilter !== "all" && org.facultyId !== facultyFilter) return false;
      return true;
    });
  }, [orgs, levelFilter, facultyFilter]);

  // Reset selected organization if it gets filtered out by level/faculty changes
  useEffect(() => {
    if (orgFilter !== "all") {
      const selectedOrg = orgMap.get(orgFilter);
      if (selectedOrg) {
        const matchesLevel = levelFilter === "all" || selectedOrg.level === levelFilter;
        const matchesFaculty = facultyFilter === "all" || selectedOrg.facultyId === facultyFilter;
        if (!matchesLevel || !matchesFaculty) {
          setOrgFilter("all");
        }
      } else {
        setOrgFilter("all");
      }
    }
  }, [levelFilter, facultyFilter, orgFilter, orgMap]);

  const filtered = useMemo(() => {
    return localAccounts.filter((acc) => {
      if (activeFilter === "active" && !acc.isActive) return false;
      if (activeFilter === "inactive" && acc.isActive) return false;
      if (deletedFilter === "notDeleted" && acc.isDeleted) return false;
      if (deletedFilter === "deleted" && !acc.isDeleted) return false;
      
      const org = orgMap.get(acc.orgId);
      if (levelFilter !== "all" && org?.level !== levelFilter) return false;
      if (facultyFilter !== "all" && org?.facultyId !== facultyFilter) return false;
      if (orgFilter !== "all" && acc.orgId !== orgFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          acc.fullName.toLowerCase().includes(q) ||
          acc.email.toLowerCase().includes(q) ||
          (acc.orgName?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [localAccounts, activeFilter, deletedFilter, orgFilter, levelFilter, facultyFilter, search, orgMap]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginatedAccounts,
  } = usePagination(filtered, 10, [
    search,
    activeFilter,
    deletedFilter,
    levelFilter,
    facultyFilter,
    orgFilter,
  ]);

  const linkedOrg = selectedAccount
    ? orgMap.get(selectedAccount.orgId) ?? null
    : null;

  const handleRowClick = (account: SuperAdminOrgAccount) => {
    setSelectedAccount(account);
    setSheetOpen(true);
  };

  const handleEditAccount = async (accountId: string, account: EditAccountFormData) => { 
    if (account) {
      try {
        await updateAccount(accountId, account);
        setLocalAccounts((prev) =>
          prev.map((acc) => {
            if (acc.id === accountId) {
              const updated = {
                ...acc,
                ...account,
              };
              if (selectedAccount && selectedAccount.id === accountId) {
                setSelectedAccount(updated);
              }
              return updated;
            }
            return acc;
          })
        );
        toast.success("Account details updated successfully!");
      }
      catch (error) {
        console.error("Error updating organization:", error);
        toast.error("Failed to update account details. Please try again.");
      }
    }

  }

  const handleToggleDeleteSubmit = async () => {
    if (!selectedAccount) return;

    try {
      const isDeleted = !selectedAccount.isDeleted;

      await updateAccount(selectedAccount.id, {isDeleted, isActive: !isDeleted});

      setLocalAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id === selectedAccount.id) {
            const updated = {
              ...acc,
              isDeleted,
              isActive: !isDeleted
            };
            setSelectedAccount(updated);
            return updated;
          }
          return acc;
        })
      );

      toast.success(
        `Account ${isDeleted? "deleted":"restored"} successfully!`
      );
    } catch (error) {
      console.error("Error updating account:", error);
      toast.error(
        `Failed to ${selectedAccount.isDeleted? "deleted":"restored"}  account. Please try again.`
      );
    } finally {
      setDeleteConfirmOpen(false);
    }
   }

  return {
    activeFilter,
    setActiveFilter,
    deletedFilter,
    setDeletedFilter,
    levelFilter,
    setLevelFilter,
    facultyFilter,
    setFacultyFilter,
    orgFilter,
    setOrgFilter,
    faculties,
    filteredOrgs,
    search,
    setSearch,
    selectedAccount,
    setSelectedAccount,
    sheetOpen,
    setSheetOpen,
    filtered,
    paginatedAccounts,
    currentPage,
    setCurrentPage,
    totalPages,
    linkedOrg,
    handleRowClick,
    editOpen,
    setEditOpen,
    handleEditAccount,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    handleToggleDeleteSubmit
  };
}
