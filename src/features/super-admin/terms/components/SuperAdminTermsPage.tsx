"use client";

import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";
import type { SuperAdminOrg } from "@/features/super-admin/types";

// Subcomponents
import { TermStatsCards } from "./TermStatsCards";
import { TermFilterCard } from "./TermFilterCard";
import { OrgSubscriptionsTable } from "./TermSubscriptionsTable";
import { SetActiveTermDialog } from "./SetActiveTermDialog";
import { RenewSubscriptionDialog } from "./RenewSubscriptionDialog";
import { ChangeTierDialog } from "./ChangeTierDialog";
import { SubscriptionHistorySheet } from "./SubscriptionHistorySheet";

// Hook
import { useSuperAdminTerms } from "../hooks/useSuperAdminTerms";
import useSuperAdminActions from "../hooks/useSuperAdminActions";
import { Term } from "@/constants/types";
import { CreateNewTermDialog } from "./CreateNewTermDialog";
import { PageHeader } from "@/features/super-admin/shared/components/PageHeader";
import { PaginationFooter } from "@/features/super-admin/shared/components/PaginationFooter";

export default function SuperAdminTermsPage({ orgs }: { orgs: SuperAdminOrg[] }) {
  const {
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
  } = useSuperAdminTerms(orgs);

  const {
    onAddTerm,
    onSetNewActiveTerm,
  } = useSuperAdminActions();

  const handleCreateTerm = async (newAY: string, newSemester: string) => {
    await onSetNewActiveTerm(newAY, newSemester);
    setSetActiveTermOpen(false);
  }

  const handleAddNewTerm = async (term: Term, setActive: boolean) => {
    await onAddTerm(term, setActive);
    setAddTermOpen(false);
  }

  return (
    <div className="animate-page-enter flex flex-col">
      {/* HEADER SECTION */}
      <PageHeader
        title="TERMS AND SUBSCRIPTIONS"
        description="Manage organization subscription tiers and renewal processes independently for each academic term."
      >
        <Button
          onClick={() => setSetActiveTermOpen(true)}
          variant="default"
          className="flex items-center gap-2"
        >
          <Calendar className="h-4 w-4" /> Set New Active Term
        </Button>
        <Button
          onClick={() => setAddTermOpen(true)}
          variant="success"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add a New Term
        </Button>
      </PageHeader>

      <div className="mx-auto max-w-7xl w-full px-5 sm:px-6 xl:px-8 py-8 space-y-6">
        {/* OVERVIEW STATS ROW */}
        <TermStatsCards
          totalSubscribed={termStats.totalSubscribed}
          totalOrgs={orgs.length}
          needsRenewalCount={termStats.needsRenewalCount}
          expiringCount={termStats.expiringCount}
          expiredCount={termStats.expiredCount}
          totalRevenue={termStats.totalRevenue}
          selectedTerm={selectedTerm}
        />

        {/* SEARCH AND FILTERS */}
        <TermFilterCard
          terms={terms}
          selectedTermId={selectedTermId}
          setSelectedTermId={setSelectedTermId}
          selectedTerm={selectedTerm}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          tierFilter={tierFilter}
          setTierFilter={setTierFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          levelFilter={levelFilter}
          setLevelFilter={setLevelFilter}
          filteredCount={filteredOrgs.length}
        />

        {/* SUBSCRIPTIONS TABLE */}
        <OrgSubscriptionsTable
          filteredOrgs={paginatedOrgs}
          selectedTerm={selectedTerm}
          onOpenChangeTier={handleOpenChangeTier}
          onOpenRenew={handleOpenRenew}
          onOpenHistory={handleOpenHistory}
        />

        {/* Pagination Footer */}
        <PaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />

        {/* --- MODAL DIALOGS --- */}

        {/* SET ACTIVE TERM DIALOG */}
        <SetActiveTermDialog
          open={setActiveTermOpen}
          onOpenChange={setSetActiveTermOpen}
          onSubmit={handleCreateTerm}
          terms={terms}
        />

        <CreateNewTermDialog
          open={addTermOpen}
          onOpenChange={setAddTermOpen}
          onSubmit={handleAddNewTerm}
          existingTerms={terms}
        />

        {/* RENEW SUBSCRIPTION DIALOG */}
        <RenewSubscriptionDialog
          open={renewOpen}
          onOpenChange={setRenewOpen}
          org={selectedOrg}
          selectedTerm={selectedTerm}
          currentSub={activeSubForSelected}
          onRenew={handleRenew}
        />

        {/* CHANGE TIER DIALOG */}
        <ChangeTierDialog
          open={changeTierOpen}
          onOpenChange={setChangeTierOpen}
          org={selectedOrg}
          currentSub={activeSubForSelected}
          onChangeTier={handleChangeTier}
          isNew={activeSubForSelected?.subscriptionStatus == "inactive"}
        />

        {/* SUBSCRIPTION HISTORY DRAWERS SHEET */}
        <SubscriptionHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          org={selectedOrg}
          historyList={orgSubscriptionHistory}
        />
      </div>
    </div>
  );
}
