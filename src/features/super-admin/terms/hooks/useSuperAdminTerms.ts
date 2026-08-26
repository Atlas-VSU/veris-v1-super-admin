import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import type { SuperAdminOrg, SubscriptionTier, Term, OrgSubscription, OrgLevel } from "@/features/super-admin/types";
import { getAllTerms } from "@/firebase/term";
import { getSubscriptionsForTerm, getSubscriptionHistoryForOrg, updateTier, saveSubscription, deriveSubscriptionStatus } from "@/firebase/subscriptions";
import { usePagination } from "@/hooks/usePagination";

export interface MappedOrg extends SuperAdminOrg {
  termSub: OrgSubscription;
}

export function useSuperAdminTerms(orgs: SuperAdminOrg[]) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<SubscriptionTier | "all" | "none">("all");
  const [statusFilter, setStatusFilter] = useState<OrgSubscription["subscriptionStatus"] | "all" | "needsRenewal">("all");
  const [levelFilter, setLevelFilter] = useState<OrgLevel | "all">("all");

  const [addTermOpen, setAddTermOpen] = useState(false);
  const [setActiveTermOpen, setSetActiveTermOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [changeTierOpen, setChangeTierOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrg | null>(null);

  // Initialize: Load terms on mount from Database
  useEffect(() => {
    let active = true;
    async function loadTerms() {
      const firebasePromise = getAllTerms();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 4000)
      );

      try {
        const allTerms = await Promise.race([firebasePromise, timeoutPromise]);
        if (!active) return;
        if (allTerms && allTerms.length > 0) {
          setTerms(allTerms);
          const activeTerm = allTerms.find((t) => t.isActive);
          if (activeTerm) {
            setSelectedTermId(activeTerm.id || "");
          } else {
            setSelectedTermId(allTerms[0].id || "");
          }
        }
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    }
    loadTerms();
    return () => {
      active = false;
    };
  }, []);

  // Fetch subscriptions for selected term from Database
  useEffect(() => {
    if (!selectedTermId) return;
    let active = true;
    async function loadSubscriptions() {
      const firebasePromise = getSubscriptionsForTerm(selectedTermId);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 4000)
      );

      try {
        const subs = await Promise.race([firebasePromise, timeoutPromise]);
        if (!active) return;
        if (subs && subs.length > 0) {
          setSubscriptions(subs);
        }
      } catch (err) {
        if (!active) return;
        console.warn("Subscriptions load failed or timed out.", err);
      }
    }
    loadSubscriptions();
    return () => {
      active = false;
    };
  }, [selectedTermId]);

  // Selected term details helper
  const selectedTerm = useMemo(() => terms.find((t) => t.id === selectedTermId), [terms, selectedTermId]);

  const mappedOrganizations = useMemo(() => {
    return orgs.map((org) => {
      const raw = subscriptions.find((s) => s.organizationId === org.id && s.termId === selectedTermId && s.subscriptionStatus !== "inactive");
      const sub: OrgSubscription = raw
        ? {
            ...raw,
            // Re-derive status from expiresAt so local state is never stale
            subscriptionStatus: deriveSubscriptionStatus(raw.subscriptionTier, raw.expiresAt),
          }
        : {
            organizationId: org.id,
            termId: selectedTermId,
            subscriptionTier: null,
            subscriptionStatus: "not_subscribed" as const,
            expiresAt: null,
            amountPaid: 0,
            paymentReference: null,
            paymentMethod: null,
          };
      return {
        ...org,
        termSub: sub,
      };
    });
  }, [orgs, subscriptions, selectedTermId]);

  const filteredOrgs = useMemo(() => {
    return mappedOrganizations.filter((org) => {
      if (org.isArchived) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = org.name.toLowerCase().includes(q) || org.shortName?.toLowerCase().includes(q);
        const matchesFaculty = org.facultyName?.toLowerCase().includes(q) || org.facultyAcronym?.toLowerCase().includes(q);
        if (!matchesName && !matchesFaculty) return false;
      }

      if (levelFilter !== "all" && org.level !== levelFilter) return false;

      if (tierFilter !== "all") {
        if (tierFilter === "none") {
          if (org.termSub.subscriptionTier !== null) return false;
        } else {
          if (org.termSub.subscriptionTier !== tierFilter) return false;
        }
      }

      if (statusFilter !== "all") {
        if (statusFilter === "needsRenewal") {
          const needs = ["expiring_soon", "expired"].includes(org.termSub.subscriptionStatus);
          if (!needs) return false;
        } else {
          if (org.termSub.subscriptionStatus !== statusFilter) return false;
        }
      }

      return true;
    });
  }, [mappedOrganizations, searchQuery, tierFilter, statusFilter, levelFilter]);

  // --- STATS AGGREGATION ---
  const termStats = useMemo(() => {
    let activeCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let totalRevenue = 0;

    subscriptions.forEach((sub) => {
      if (sub.subscriptionStatus === "active") activeCount++;
      if (sub.subscriptionStatus === "expiring_soon") expiringCount++;
      if (sub.subscriptionStatus === "expired") expiredCount++;
      if (sub.subscriptionStatus === "active" || sub.subscriptionStatus === "expiring_soon") {
        totalRevenue += sub.amountPaid;
      }
    });

    return {
      activeCount,
      expiringCount,
      expiredCount,
      needsRenewalCount: expiringCount + expiredCount,
      totalSubscribed: activeCount + expiringCount,
      totalRevenue,
    };
  }, [subscriptions]);

  const handleOpenRenew = (org: SuperAdminOrg, currentSub: OrgSubscription) => {
    setSelectedOrg(org);
    setRenewOpen(true);
  };

  const handleOpenChangeTier = (org: SuperAdminOrg, currentSub: OrgSubscription) => {
    setSelectedOrg(org);
    setChangeTierOpen(true);
  };

  const handleOpenHistory = (org: SuperAdminOrg) => {
    setSelectedOrg(org);
    setHistoryOpen(true);
  };

  const handleRenew = async (
    orgId: string,
    tier: SubscriptionTier,
    validUntil: string,
    amount: number,
    refNum: string,
    method: string
  ) => {
    if (!selectedOrg) return;

    const newSub: OrgSubscription = {
      organizationId: orgId,
      termId: selectedTermId,
      subscriptionTier: tier,
      subscriptionStatus: "active",
      expiresAt: validUntil,
      amountPaid: amount,
      paymentReference: refNum,
      paymentMethod: method,
    };

    await saveSubscription(selectedTermId, orgId, newSub);
    
    setSubscriptions((prev) => {
      const index = prev.findIndex((s) => s.organizationId === orgId && s.termId === selectedTermId);
      if (index > -1) {
        const updated = [...prev];
        updated[index] = newSub;
        return updated;
      } else {
        return [...prev, newSub];
      }
    });

    toast.success(`Subscription for ${selectedOrg.name} renewed successfully!`);
  };

  const handleChangeTier = async (
    orgId: string,
    newTier: SubscriptionTier | "none",
    expiresAt: string,
    amountPaid: number,
    referenceId: string,
    paymentMethod: string
  ) => {
    if (!selectedOrg) return;

    const tierVal = newTier === "none" ? null : newTier;

    await updateTier(orgId, newTier, selectedTermId, expiresAt, amountPaid, referenceId, paymentMethod);

    setSubscriptions((prev) => {
      const existing = prev.find((s) => s.organizationId === orgId && s.termId === selectedTermId);
      const updatedSub: OrgSubscription = {
        organizationId: orgId,
        termId: selectedTermId,
        subscriptionTier: tierVal,
        subscriptionStatus: tierVal === null ? "not_subscribed" : "active",
        expiresAt: newTier !== "none" ? expiresAt : (existing?.expiresAt || null),
        amountPaid: newTier !== "none" ? amountPaid : 0,
        paymentReference: newTier !== "none" ? referenceId : null,
        paymentMethod: newTier !== "none" ? paymentMethod : null,
      };

      const index = prev.findIndex((s) => s.organizationId === orgId && s.termId === selectedTermId);
      if (index > -1) {
        const updated = [...prev];
        updated[index] = updatedSub;
        return updated;
      } else {
        return [...prev, updatedSub];
      }
    });

    toast.success(`Subscription tier for ${selectedOrg.name} updated.`);
  };

  // Get specific organization history dynamically from Database
  const [orgSubscriptionHistory, setOrgSubscriptionHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedOrg || !historyOpen) return;
    const orgId = selectedOrg.id;
    async function loadHistory() {
      try {
        const history = await getSubscriptionHistoryForOrg(orgId);
        if (history && history.length > 0) {
          const matched = history.map((sub: OrgSubscription) => {
            const term = terms.find((t) => t.id === sub.termId);
            return {
              term: term || { AY: "Unknown", semester: "Unknown", isActive: false },
              sub,
            };
          });
          setOrgSubscriptionHistory(matched);
        } else {
          // Fallback to local subscriptions matching orgId
          const fallbackHistory = subscriptions.filter((s) => s.organizationId === orgId);
          const matched = fallbackHistory.map((sub: OrgSubscription) => {
            const term = terms.find((t) => t.id === sub.termId);
            return {
              term: term || { AY: "Unknown", semester: "Unknown", isActive: false },
              sub,
            };
          });
          setOrgSubscriptionHistory(matched);
        }
      } catch (err) {
        const fallbackHistory = subscriptions.filter((s) => s.organizationId === orgId);
        const matched = fallbackHistory.map((sub: OrgSubscription) => {
          const term = terms.find((t) => t.id === sub.termId);
          return {
            term: term || { AY: "Unknown", semester: "Unknown", isActive: false },
            sub,
          };
        });
        setOrgSubscriptionHistory(matched);
      }
    }
    loadHistory();
  }, [selectedOrg, historyOpen, terms, subscriptions]);

  const activeSubForSelected = useMemo(() => {
    if (!selectedOrg) return null;
    return subscriptions.find((s) => s.organizationId === selectedOrg.id && s.termId === selectedTermId) || null;
  }, [selectedOrg, subscriptions, selectedTermId]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginatedOrgs,
  } = usePagination(filteredOrgs, 10, [searchQuery, tierFilter, statusFilter, levelFilter]);

  return {
    terms,
    selectedTermId,
    setSelectedTermId,
    searchQuery,
    setSearchQuery,
    tierFilter,
    setTierFilter,
    statusFilter,
    setStatusFilter,
    levelFilter,
    setLevelFilter,
    selectedTerm,
    filteredOrgs,
    paginatedOrgs,
    currentPage,
    setCurrentPage,
    totalPages,
    termStats,
    selectedOrg,
    setActiveTermOpen,
    setSetActiveTermOpen,
    addTermOpen,
    setAddTermOpen,
    renewOpen,
    setRenewOpen,
    changeTierOpen,
    setChangeTierOpen,
    historyOpen,
    setHistoryOpen,
    orgSubscriptionHistory,
    activeSubForSelected,
    handleOpenRenew,
    handleOpenChangeTier,
    handleOpenHistory,
    handleRenew,
    handleChangeTier,
    isInitializing,
    auditLogs
  };
}
