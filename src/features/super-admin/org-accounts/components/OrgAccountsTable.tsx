"use client";

import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/features/super-admin/shared/components/StatusBadge";
import { OrgAccountDetailSheet } from "./OrgAccountDetailSheet";
import { TableSkeleton } from "@/features/super-admin/shared/components/TableSkeleton";
import type {
  SuperAdminOrgAccount,
  SuperAdminOrg,
  OrgLevel,
} from "@/features/super-admin/types";
import { Users, CheckCircle2, XCircle, MoreVertical, Edit2, Eye, Archive } from "lucide-react";
import { format } from "date-fns";
import { useOrgAccountsTable } from "../hooks/useOrgAccountsTable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditAccountDialog } from "./EditAccountDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OrgAccountsFilterHeader } from "./OrgAccountsFilterHeader";
import { PaginationFooter } from "@/features/super-admin/shared/components/PaginationFooter";

interface OrgAccountsTableProps {
  accounts: SuperAdminOrgAccount[];
  orgs: SuperAdminOrg[];
  isLoading?: boolean;
}

export function OrgAccountsTable({
  accounts,
  orgs,
  isLoading = false,
}: OrgAccountsTableProps) {
  const {
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
    handleEditAccount,
    editOpen,
    setEditOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    handleToggleDeleteSubmit
  } = useOrgAccountsTable(accounts, orgs);

  const orgLogoMap = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.orgLogoUrl])),
    [orgs]
  );

  const onTriggerEdit = (account: SuperAdminOrgAccount | null) => {
    if (account) {
      setSelectedAccount(account);
      setEditOpen(true);
    }
  }
  
  const onToggleDeleteConfirm = (account: SuperAdminOrgAccount | null) => {
    if (account) {
      setSelectedAccount(account);
      setDeleteConfirmOpen(true);
    }
   }

  return (
    <>
      {/* Filters Component */}
      <OrgAccountsFilterHeader
        search={search}
        setSearch={setSearch}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        deletedFilter={deletedFilter}
        setDeletedFilter={setDeletedFilter}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        facultyFilter={facultyFilter}
        setFacultyFilter={setFacultyFilter}
        orgFilter={orgFilter}
        setOrgFilter={setOrgFilter}
        faculties={faculties}
        filteredOrgs={filteredOrgs}
        totalResults={filtered.length}
      />

      {/* Table */}
      <div className="rounded-lg border border-blue-50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-blue-50">
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
                Full Name
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden sm:table-cell">
                Email
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden md:table-cell">
                Organization
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
                Active
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden lg:table-cell">
                Created At
              </TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>

          {isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-10 w-10 text-slate-200 mb-3" />
                    <p className="text-sm font-medium text-slate-500">
                      No accounts found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting your filters
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody>
              {paginatedAccounts.map((account) => (
                <TableRow
                  key={account.id}
                  className="cursor-pointer hover:bg-blue-50/50 transition-colors border-b border-slate-50 last:border-0"
                  onClick={() => handleRowClick(account)}
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0 overflow-hidden border border-blue-100">
                        {orgLogoMap.get(account.orgId) ? (
                          <img src={orgLogoMap.get(account.orgId) || ""} alt={account.orgName || ""} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-blue-600">
                            {account.firstName.charAt(0).toUpperCase()+account.lastName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-slate-800 truncate max-w-[160px]">
                        {account.firstName+" "+account.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 hidden sm:table-cell">
                    <span className="text-sm text-slate-500 truncate max-w-[200px] block">
                      {account.email}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 hidden md:table-cell">
                    <span className="text-sm text-slate-600 truncate max-w-[160px] block">
                      {account.orgName ?? (
                        <span className="text-slate-300">—</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    {account.isActive ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Active</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-500 text-xs font-medium">
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Inactive</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400">
                      {account.createdAt
                        ? format(new Date(account.createdAt), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-slate-100 text-xs">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleRowClick(account)} className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-slate-400" /> View Account
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTriggerEdit(account)} className="flex items-center gap-2">
                        <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit Account
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onToggleDeleteConfirm(account)}
                        className="flex items-center gap-2 text-amber-600 focus:text-amber-700"
                      >
                          <Archive className="h-3.5 w-3.5 text-amber-400" /> {account.isDeleted ? "Reactivate Account" : "Delete Account"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                </TableRow>
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
      <OrgAccountDetailSheet
        account={selectedAccount}
        linkedOrg={linkedOrg}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <EditAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        account={selectedAccount}
        onSave={handleEditAccount}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white border border-slate-100 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-500" /> Confirm Action
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Are you sure you want to {selectedAccount?.isDeleted ? "reactivate" : "delete"} the account{" "}
              <span className="font-bold text-slate-700">"{selectedAccount?.fullName}"</span>?
              {!selectedAccount?.isDeleted && " Deleting will hide the organization from the system."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-slate-200 text-slate-600 text-xs h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleDeleteSubmit}
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
