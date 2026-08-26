"use client";

import React, { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgLevel, SortOption } from "@/features/super-admin/types";

interface OrgAccountsFilterHeaderProps {
  search: string;
  setSearch: (search: string) => void;
  activeFilter: "all" | "active" | "inactive";
  setActiveFilter: (filter: "all" | "active" | "inactive") => void;
  deletedFilter: "all" | "notDeleted" | "deleted";
  setDeletedFilter: (filter: "all" | "notDeleted" | "deleted") => void;
  levelFilter: OrgLevel | "all";
  setLevelFilter: (level: OrgLevel | "all") => void;
  facultyFilter: string;
  setFacultyFilter: (faculty: string) => void;
  orgFilter: string;
  setOrgFilter: (org: string) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  faculties: Array<{ id: string; name: string; acronym: string }>;
  filteredOrgs: Array<{ id: string; name: string }>;
  totalResults: number;
}

export function OrgAccountsFilterHeader({
  search,
  setSearch,
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
  sortBy,
  setSortBy,
  faculties,
  filteredOrgs,
  totalResults,
}: OrgAccountsFilterHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate active filters count (excluding search)
  const activeFiltersCount = [
    activeFilter !== "all",
    deletedFilter !== "all",
    levelFilter !== "all",
    facultyFilter !== "all",
    orgFilter !== "all",
  ].filter(Boolean).length;

  const hasAnyFilter = activeFiltersCount > 0 || search !== "";

  const handleClearFilters = () => {
    setActiveFilter("all");
    setDeletedFilter("all");
    setLevelFilter("all");
    setFacultyFilter("all");
    setOrgFilter("all");
    setSearch("");
  };

  return (
    <div className="space-y-3 mb-6">
      {/* Top Bar: Search & Expand Trigger */}
      <div className="flex items-center gap-3 w-full">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-10 text-sm border-blue-100 focus-visible:ring-blue-300 shadow-sm bg-white"
          />
        </div>

        <Button
          variant={isExpanded || activeFiltersCount > 0 ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-10 px-4 border-blue-100 flex items-center gap-2 text-slate-700 font-medium shrink-0 shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          <span className="hidden sm:inline">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="flex items-center justify-center bg-blue-600 text-white rounded-full text-[10px] w-5 h-5 font-bold">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {/* Sort Select */}
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortOption)}
        >
          <SelectTrigger className="w-[195px] h-10 text-sm border-blue-100 bg-white shadow-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200 text-xs">
            <SelectItem value="name-asc">Alphabetical (A-Z)</SelectItem>
            <SelectItem value="name-desc">Alphabetical (Z-A)</SelectItem>
            <SelectItem value="date-newest">Recently Created</SelectItem>
            <SelectItem value="date-oldest">Oldest Created</SelectItem>
          </SelectContent>
        </Select>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-10 text-slate-500 hover:text-slate-700 shrink-0 font-medium text-xs flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear</span>
          </Button>
        )}

        <div className="text-xs text-slate-400 ml-auto hidden md:block whitespace-nowrap bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
          Showing <span className="font-semibold text-slate-700">{totalResults}</span> account{totalResults !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Results summary on mobile when filters are active */}
      <div className="flex md:hidden items-center justify-between px-1 text-xs text-slate-400">
        <div>
          Showing <span className="font-semibold text-slate-700">{totalResults}</span> result{totalResults !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Collapsible Panel */}
      {isExpanded && (
        <div className="bg-slate-50/50 rounded-xl p-4 border border-blue-50/55 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Account Status</span>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deleted Status Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">System Status</span>
            <Select
              value={deletedFilter}
              onValueChange={(v) => setDeletedFilter(v as typeof deletedFilter)}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="notDeleted">Not Deleted</SelectItem>
                <SelectItem value="deleted">Deleted Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Level Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Org Level</span>
            <Select
              value={levelFilter}
              onValueChange={(v) => setLevelFilter(v as OrgLevel | "all")}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="faculty">Faculty</SelectItem>
                <SelectItem value="council">Council</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Faculty Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Faculty / College</span>
            <Select
              value={facultyFilter}
              onValueChange={(v) => setFacultyFilter(v)}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white truncate">
                <SelectValue placeholder="All Faculties" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 max-h-[300px]">
                <SelectItem value="all">All Faculties</SelectItem>
                {faculties.map((fac) => (
                  <SelectItem key={fac.id} value={fac.id}>
                    {fac.acronym ? `${fac.name} (${fac.acronym})` : fac.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Organization Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Specific Org</span>
            <Select
              value={orgFilter}
              onValueChange={(v) => setOrgFilter(v)}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white truncate">
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 max-h-[300px]">
                <SelectItem value="all">All Organizations</SelectItem>
                {filteredOrgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
