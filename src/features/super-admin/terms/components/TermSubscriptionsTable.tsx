"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Edit2,
  History,
} from "lucide-react";
import { TierBadge } from "@/features/super-admin/shared/components/TierBadge";
import type { SuperAdminOrg, OrgLevel, Term, OrgSubscription } from "../../types";
import { format, parseISO } from "date-fns";

interface MappedOrg extends SuperAdminOrg {
  termSub: OrgSubscription;
}

interface OrgSubscriptionsTableProps {
  filteredOrgs: MappedOrg[];
  selectedTerm: Term | undefined;
  onOpenChangeTier: (org: SuperAdminOrg, currentSub: OrgSubscription) => void;
  onOpenRenew: (org: SuperAdminOrg, currentSub: OrgSubscription) => void;
  onOpenHistory: (org: SuperAdminOrg) => void;
}

const levelLabels: Record<OrgLevel, string> = {
  department: "Department",
  faculty: "Faculty",
  council: "Council",
};

export function OrgSubscriptionsTable({
  filteredOrgs,
  selectedTerm,
  onOpenChangeTier,
  onOpenRenew,
  onOpenHistory,
}: OrgSubscriptionsTableProps) {
  return (
    <div className="rounded-lg border border-blue-50 overflow-hidden bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-blue-50">
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 pl-4">
              Organization Name
            </TableHead>
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
              Level
            </TableHead>
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
              Subscription Tier
            </TableHead>
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
              Renewal Status
            </TableHead>
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 hidden sm:table-cell">
              Valid Until
            </TableHead>
            <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 pr-4 text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredOrgs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <Building2 className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">
                    No organizations found for the selected term
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Adjust your search or category filters to find organizations.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            filteredOrgs.map((org) => {
              const sub = org.termSub;

              // Status Badge Color Map
              const statusConfig = {
                active: {
                  label: "Active",
                  class: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
                  icon: CheckCircle2,
                },
                expiring_soon: {
                  label: "Expiring Soon",
                  class: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
                  icon: AlertTriangle,
                },
                expired: {
                  label: "Expired",
                  class: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
                  icon: XCircle,
                },
                not_subscribed: {
                  label: "Not Subscribed",
                  class: "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100",
                  icon: HelpCircle,
                },
                grace_period: {
                  label: "Grace Period",
                  class: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
                  icon: AlertTriangle,
                },
                inactive: {
                  label: "Inactive",
                  class: "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100",
                  icon: HelpCircle,
                },
              }[sub.subscriptionStatus || "not_subscribed"];

              const StatusIcon = statusConfig.icon;

              return (
                <TableRow
                  key={org.id}
                  className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0"
                >
                  {/* Name & short_name */}
                  <TableCell className="py-3 pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-100">
                        {org.orgLogoUrl ? (
                          <img src={org.orgLogoUrl} alt={org.name} className="h-full w-full object-cover" />
                        ) : (
                          <Building2 className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 leading-none mb-1">
                          {org.name}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono font-medium">
                          {org.shortName || "—"}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Level */}
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium bg-slate-50 text-slate-600 border-slate-200"
                    >
                      {levelLabels[org.level] ?? org.level}
                    </Badge>
                  </TableCell>

                  {/* Subscription Tier */}
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1.5">
                      <TierBadge tier={sub.subscriptionTier} />
                      {selectedTerm?.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onOpenChangeTier(org, sub)}
                          className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Change subscription tier"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>

                  {/* Renewal Status Badge */}
                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold border flex items-center gap-1 w-fit py-0.5 px-2 ${statusConfig.class}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                      {statusConfig.label}
                    </Badge>
                  </TableCell>

                  {/* Expiration date */}
                  <TableCell className="py-3 hidden sm:table-cell">
                    <span className="text-xs text-slate-500 font-medium">
                      {sub.expiresAt ? format(parseISO(sub.expiresAt), "MMM dd, yyyy") : "—"}
                    </span>
                  </TableCell>

                  {/* Action buttons */}
                  <TableCell className="py-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Renew Action button */}
                      {["expired", "expiring_soon"].includes(sub.subscriptionStatus) && selectedTerm?.isActive ? (
                        <Button
                          size="sm"
                          onClick={() => onOpenRenew(org, sub)}
                          className="font-medium text-xs h-7 px-3 py-1 shadow-sm shrink-0"
                        >
                          Renew
                        </Button>
                      ) : sub.subscriptionStatus === "not_subscribed" && selectedTerm?.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenRenew(org, sub)}
                          className="border-blue-200 hover:bg-blue-50 text-blue-700 font-medium text-xs h-7 px-3 py-1 shrink-0"
                        >
                          Activate
                        </Button>
                      ) : null}

                      {/* View History icon button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenHistory(org)}
                        className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="View Subscription History"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
