"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, SlidersHorizontal, X } from "lucide-react";
import type { OrgLevel, SubscriptionTier, SortOption } from "@/features/super-admin/types";

interface OrgFilterHeaderProps {
  search: string;
  setSearch: (search: string) => void;
  levelFilter: OrgLevel | "all";
  setLevelFilter: (level: OrgLevel | "all") => void;
  statusFilter: "all" | "active" | "inactive" | "archived";
  setStatusFilter: (status: "all" | "active" | "inactive" | "archived") => void;
  tierFilter: SubscriptionTier | "all";
  setTierFilter: (tier: SubscriptionTier | "all") => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  onCreateClick: () => void;
  totalResults?: number;
}

export function OrgFilterHeader({
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
  onCreateClick,
  totalResults = 0,
}: OrgFilterHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate active filters count (excluding search)
  const activeFiltersCount = [
    levelFilter !== "all",
    statusFilter !== "all",
    tierFilter !== "all",
  ].filter(Boolean).length;

  const hasAnyFilter = activeFiltersCount > 0 || search !== "";

  const handleClearFilters = () => {
    setLevelFilter("all");
    setStatusFilter("all");
    setTierFilter("all");
    setSearch("");
  };

  return (
    <div className="space-y-3 mb-5">
      {/* Top Row: Search, Filters toggle, Sort, and Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-10 text-sm border-blue-100 focus-visible:ring-blue-300 shadow-sm bg-white"
            />
          </div>

          {/* Filters Toggle Button */}
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
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
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

          {/* Clear Filters Button */}
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

          <div className="text-xs text-slate-400 hidden xl:block whitespace-nowrap bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
            Total Orgs: <span className="font-semibold text-slate-700">{totalResults}</span>
          </div>
        </div>

        {/* Create Button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={onCreateClick}
            size="sm"
            className="h-10 px-4 text-xs shadow-sm font-semibold flex items-center gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" /> Add Organization
          </Button>
        </div>
      </div>

      {/* Collapsible Panel */}
      {isExpanded && (
        <div className="bg-slate-50/50 rounded-xl p-4 border border-blue-50/55 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Level Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Org Level</span>
            <Select
              value={levelFilter}
              onValueChange={(value) => setLevelFilter(value as OrgLevel | "all")}
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

          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Status</span>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
                <SelectItem value="archived">Archived Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tier Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Subscription Tier</span>
            <Select
              value={tierFilter}
              onValueChange={(value) => setTierFilter(value as SubscriptionTier | "all")}
            >
              <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="basic">Basic Tier</SelectItem>
                <SelectItem value="plus">Plus Tier</SelectItem>
                <SelectItem value="premium">Premium Tier</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
