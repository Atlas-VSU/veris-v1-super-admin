"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { PaginationFooter } from "@/features/super-admin/shared/components/PaginationFooter";
import { OrgDetailSheet } from "./OrgDetailSheet";
import { TableSkeleton } from "@/features/super-admin/shared/components/TableSkeleton";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { EditOrgDialog } from "./EditOrgDialog";
import type {
  SuperAdminOrg,
  SuperAdminOrgAccount,
  OrgLevel,
} from "@/features/super-admin/types";
import { Building2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrgsTable } from "../hooks/useOrgsTable";
import { OrgFilterHeader } from "./OrgFilterHeader";
import { OrgTableRow } from "./OrgTableRow";

interface OrgsTableProps {
  isLoading?: boolean;
}

const levelLabels: Record<OrgLevel, string> = {
  department: "Department",
  faculty: "Faculty",
  council: "Council",
};

export function OrgsTable({isLoading = false }: OrgsTableProps) {
  const {
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
  } = useOrgsTable({itemsPerPage:10});

  const linkedAccounts = useMemo(() => {
    return selectedOrg
      ? accounts.filter((a) => a.orgId === selectedOrg.id)
      : [];
  }, [selectedOrg, accounts]);

  const handleRowClick = (org: SuperAdminOrg) => {
    setSelectedOrg(org);
    setSheetOpen(true);
  };

  const handleTriggerEdit = (org: SuperAdminOrg) => {
    setSelectedOrg(org);
    setEditOpen(true);
  };

  return (
    <>
      {/* Search and Action Header */}
      <OrgFilterHeader
        search={search}
        setSearch={setSearch}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        tierFilter={tierFilter}
        setTierFilter={setTierFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        onCreateClick={() => setCreateOpen(true)}
        totalResults={totalOrgsCount}
      />

      {/* Main Table */}
      <div className="rounded-lg border border-blue-50 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-blue-50">
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 pl-4">
                Logo / Name
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
                Acronym
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
                Level
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden md:table-cell">
                Adviser
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden lg:table-cell">
                President
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
                Status
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden sm:table-cell">
                Created
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 pr-4 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          {isLoading ? (
            <TableSkeleton rows={itemsPerPage} cols={8} />
          ) : localOrgs.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={8} className="py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <Building2 className="h-10 w-10 text-slate-200 mb-3" />
                    <p className="text-sm font-medium text-slate-500">
                      No organizations found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting your search queries or category filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody>
              {localOrgs.map((org) => (
                <OrgTableRow
                  key={org.id}
                  org={org}
                  levelLabels={levelLabels}
                  onRowClick={handleRowClick}
                  onTriggerEdit={handleTriggerEdit}
                  onToggleArchiveConfirm={handleToggleArchiveConfirm}
                />
              ))}
            </TableBody>
          )}
        </Table>
      </div>

      {/* Pagination Footer */}
      <PaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      {/* Detail Sheet */}
      <OrgDetailSheet
        org={selectedOrg}
        linkedAccounts={linkedAccounts}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onEdit={handleTriggerEdit}
        onToggleArchive={handleToggleArchiveConfirm}
      />

      {/* CREATE DIALOG */}
      <CreateOrgDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateOrg}
        faculties={faculties}
        programs={programs}
      />

      {/* EDIT DIALOG */}
      <EditOrgDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        org={selectedOrg}
        onSave={handleEditOrg}
        faculties={faculties}
        programs={programs}
      />

      {/* ARCHIVE CONFIRM DIALOG */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent className="bg-white border border-slate-100 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" /> Confirm Action
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Are you sure you want to {archiveTargetOrg?.isArchived ? "reactivate" : "archive"} the organization{" "}
              <span className="font-bold text-slate-700">"{archiveTargetOrg?.name}"</span>?
              {!archiveTargetOrg?.isArchived && " Archiving will hide the organization from typical listings."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 ">
            <AlertDialogCancel className="border-slate-200 text-slate-600 text-xs h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleArchiveSubmit}
              className="text-xs h-9"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
