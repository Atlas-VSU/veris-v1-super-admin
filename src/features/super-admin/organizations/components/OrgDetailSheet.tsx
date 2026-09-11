"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/features/super-admin/shared/components/TierBadge";
import { StatusBadge } from "@/features/super-admin/shared/components/StatusBadge";
import type { SuperAdminOrg, SuperAdminOrgAccount } from "@/features/super-admin/types";
import {
  Building2,
  BookOpen,
  GraduationCap,
  Tag,
  User,
  Mail,
  Calendar,
  CheckCircle2,
  XCircle,
  CreditCard,
  Archive,
  Edit2,
  ArrowRight,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface OrgDetailSheetProps {
  org: SuperAdminOrg | null;
  linkedAccounts: SuperAdminOrgAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (org: SuperAdminOrg) => void;
  onToggleArchive?: (org: SuperAdminOrg) => void;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon ? (
        <div className="mt-0.5 shrink-0 text-blue-500">
          <Icon className="h-4 w-4" />
        </div>
      ) : (
        <div className="w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <div className="text-sm text-slate-800 font-medium">{value}</div>
      </div>
    </div>
  );
}

const levelLabels: Record<string, string> = {
  department: "Department",
  faculty: "Faculty",
  council: "Council",
};

export function OrgDetailSheet({
  org,
  linkedAccounts,
  open,
  onOpenChange,
  onEdit,
  onToggleArchive,
}: OrgDetailSheetProps) {
  const router = useRouter();

  if (!org) return null;

  const handleManageSubscription = () => {
    onOpenChange(false);
    router.push("/super-admin/terms");
  };

  const statusVariant = org.isArchived
    ? "archived"
    : org.subscribed
    ? "active"
    : "inactive";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-white border-l border-blue-100 p-0 flex flex-col max-h-screen overflow-y-auto"
      >
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-16">
          <SheetHeader className="p-0 pb-2 pr-8">
            <div className="flex items-start gap-3">
              {/* Logo / Avatar representation */}
              <div className={`flex items-center justify-center h-12 w-12 rounded-full font-bold text-sm shrink-0 shadow-sm overflow-hidden border ${org.orgLogoUrl ? "bg-white border-slate-200" : "bg-blue-600 text-white border-blue-100"}`}>
                {org.orgLogoUrl ? (
                  <img src={org.orgLogoUrl} alt={org.name} className="h-full w-full object-cover" />
                ) : (
                  org.shortName ? org.shortName.substring(0, 3).toUpperCase() : org.name.substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base font-bold text-slate-800 leading-tight">
                  {org.name}
                </SheetTitle>
                <SheetDescription className="text-sm text-slate-500 mt-0.5">
                  {org.shortName} · {levelLabels[org.level] ?? org.level}
                </SheetDescription>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              {org.subscriptionTier && <TierBadge tier={org.subscriptionTier} />}
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold border ${
                  org.isArchived
                    ? "bg-gray-100 text-gray-500 border-gray-200"
                    : org.subscribed
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {org.isArchived ? "Archived" : org.subscribed ? "Active Subscribed" : "Inactive"}
              </Badge>
            </div>
          </SheetHeader>

          {/* Quick Admin Actions Row */}
          <div className="flex gap-2 w-full pt-1">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(org)}
                className="flex-1 h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
              </Button>
            )}
            {onToggleArchive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleArchive(org)}
                className={`flex-1 h-8 text-xs ${
                  org.isArchived
                    ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                {org.isArchived ? "Reactivate" : "Archive"}
              </Button>
            )}
          </div>

          <Separator className="bg-blue-50" />

          {/* Org Details Profile */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              General Profile
            </h3>
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-lg bg-slate-50/50 p-2 text-xs">
              <DetailRow
                icon={Building2}
                label="Full Name"
                value={org.name}
              />
              <DetailRow
                icon={Tag}
                label="Acronym"
                value={org.shortName || "—"}
              />
              <DetailRow
                icon={GraduationCap}
                label="Level"
                value={
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                  >
                    {levelLabels[org.level] ?? org.level}
                  </Badge>
                }
              />
              <DetailRow
                icon={BookOpen}
                label="Faculty / Program"
                value={
                  org.facultyName
                    ? `${org.facultyName}${org.facultyAcronym ? ` (${org.facultyAcronym})` : ""}`
                    : "Independent"
                }
              />
              <DetailRow
                icon={User}
                label="Faculty Adviser"
                value={org.adviser || "No Adviser Recorded"}
              />
              <DetailRow
                icon={User}
                label="Current President"
                value={org.president || "No President Assigned"}
              />
              <DetailRow
                icon={Mail}
                label="Contact Email"
                value={org.contactEmail || "No Email Address"}
              />
              <DetailRow
                icon={Calendar}
                label="Created At"
                value={org.createdAt ? org.createdAt : "—"}
              />
              <div className="py-2.5 pl-7">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">About / Description</p>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {org.description || "No description provided."}
                </p>
              </div>
            </div>
          </section>

          <Separator className="bg-blue-50" />

          {/* Current Subscription Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Current Subscription
              </h3>
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[9px] font-bold uppercase tracking-wider">
                AY 2025-2026
              </Badge>
            </div>
            <div className="border border-slate-100 rounded-lg bg-slate-50/50 p-3 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-white border border-slate-100 rounded p-2.5">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tier</p>
                  <TierBadge tier={org.subscriptionTier} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Status</p>
                  <span className={`font-bold ${org.subscribed ? "text-emerald-600" : "text-amber-600"}`}>
                    {org.subscribed ? "Subscribed" : "Unsubscribed / Pending"}
                  </span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded p-2.5 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-500 leading-normal">
                  Subscription cycles are managed term-by-term. To renew, adjust billing, or registerGCash transactions, visit Terms Management.
                </span>
              </div>

              <Button
                onClick={handleManageSubscription}
                className="w-full font-medium text-xs h-8 flex items-center justify-center gap-1.5 shadow-sm"
              >
                Manage Subscription <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </section>

          <Separator className="bg-blue-50" />

          {/* Linked Account */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Admin Account(s)
            </h3>
            {linkedAccounts && linkedAccounts.length > 0 ? (
              <div className="space-y-3">
                {linkedAccounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 divide-y divide-slate-50">
                    <DetailRow
                      icon={User}
                      label="Full Name"
                      value={account.fullName}
                    />
                    <DetailRow
                      icon={Mail}
                      label="Email"
                      value={account.email}
                    />
                    <DetailRow
                      icon={User}
                      label="Account Status"
                      value={
                        <StatusBadge
                          variant={account.isActive ? "active" : "inactive"}
                        />
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-blue-100 bg-slate-50 px-4 py-8 text-center">
                <User className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No linked admin account</p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
