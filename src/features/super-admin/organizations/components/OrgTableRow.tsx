import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Edit2, Archive } from "lucide-react";
import type { SuperAdminOrg, OrgLevel } from "@/features/super-admin/types";

interface OrgTableRowProps {
  org: SuperAdminOrg;
  levelLabels: Record<OrgLevel, string>;
  onRowClick: (org: SuperAdminOrg) => void;
  onTriggerEdit: (org: SuperAdminOrg) => void;
  onToggleArchiveConfirm: (org: SuperAdminOrg) => void;
}

export function OrgTableRow({
  org,
  levelLabels,
  onRowClick,
  onTriggerEdit,
  onToggleArchiveConfirm,
}: OrgTableRowProps) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-blue-50/20 transition-colors border-b border-slate-50 last:border-0"
      onClick={() => onRowClick(org)}
    >
      {/* Logo/Name */}
      <TableCell className="py-3 pl-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs shrink-0 border border-blue-200 overflow-hidden">
            {org.orgLogoUrl ? (
              <img src={org.orgLogoUrl} alt={org.name} className="h-full w-full object-cover" />
            ) : (
              org.shortName
                ? org.shortName.substring(0, 3).toUpperCase()
                : org.name.substring(0, 2).toUpperCase()
            )}
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
            {org.name}
          </span>
        </div>
      </TableCell>

      {/* Acronym */}
      <TableCell className="py-3 font-mono text-xs text-slate-500 font-medium">
        {org.shortName || "—"}
      </TableCell>

      {/* Level */}
      <TableCell className="py-3">
        <Badge
          variant="outline"
          className="text-[10px] font-medium bg-blue-50 text-blue-700 border-blue-100"
        >
          {levelLabels[org.level] ?? org.level}
        </Badge>
      </TableCell>

      {/* Adviser */}
      <TableCell className="py-3 hidden md:table-cell text-xs text-slate-600 font-medium">
        {org.adviser || "—"}
      </TableCell>

      {/* President */}
      <TableCell className="py-3 hidden lg:table-cell text-xs text-slate-600 font-medium">
        {org.president || "—"}
      </TableCell>

      {/* Status indicator */}
      <TableCell className="py-3">
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
          {org.isArchived ? "Archived" : org.subscribed ? "Active" : "Inactive"}
        </Badge>
      </TableCell>

      {/* Created Date */}
      <TableCell className="py-3 hidden sm:table-cell text-xs text-slate-500 font-mono">
        {org.createdAt || "—"}
      </TableCell>

      {/* Actions column */}
      <TableCell className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white border border-slate-100 text-xs">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRowClick(org)} className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-slate-400" /> View Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTriggerEdit(org)} className="flex items-center gap-2">
              <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onToggleArchiveConfirm(org)}
              className="flex items-center gap-2 text-amber-600 focus:text-amber-700"
            >
              <Archive className="h-3.5 w-3.5 text-amber-400" />
              {org.isArchived ? "Reactivate Org" : "Archive Org"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
