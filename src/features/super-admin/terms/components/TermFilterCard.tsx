"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Info, SlidersHorizontal, X } from "lucide-react";
import type { SubscriptionTier, Term, OrgLevel } from "../../types";

interface TermFilterCardProps {
  terms: Term[];
  selectedTermId: string;
  setSelectedTermId: (id: string) => void;
  selectedTerm: Term | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  tierFilter: SubscriptionTier | "all" | "none";
  setTierFilter: (tier: SubscriptionTier | "all" | "none") => void;
  statusFilter: string;
  setStatusFilter: (status: any) => void;
  levelFilter: OrgLevel | "all";
  setLevelFilter: (level: OrgLevel | "all") => void;
  filteredCount: number;
}

export function TermFilterCard({
  terms,
  selectedTermId,
  setSelectedTermId,
  selectedTerm,
  searchQuery,
  setSearchQuery,
  tierFilter,
  setTierFilter,
  statusFilter,
  setStatusFilter,
  levelFilter,
  setLevelFilter,
  filteredCount,
}: TermFilterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate active filters count (excluding search query)
  const activeFiltersCount = [
    tierFilter !== "all",
    statusFilter !== "all",
    levelFilter !== "all",
  ].filter(Boolean).length;

  const hasAnyFilter = activeFiltersCount > 0 || searchQuery !== "";

  const handleClearFilters = () => {
    setTierFilter("all");
    setStatusFilter("all");
    setLevelFilter("all");
    setSearchQuery("");
  };

  return (
    <Card className="border border-blue-50 shadow-sm p-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Term Selector */}
        <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
          <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Academic Term:</span>
          <Select value={selectedTermId} onValueChange={setSelectedTermId}>
            <SelectTrigger className="w-full sm:w-[260px] h-9 border-blue-200 focus-visible:ring-blue-300 font-medium bg-white">
              <SelectValue placeholder="Select Term" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {terms.map((t) => (
                <SelectItem key={t.id || ""} value={t.id || ""} className="font-medium">
                  AY {t.AY} — {t.semester} {t.isActive && "(Active)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Stats Indicator Banner */}
        {selectedTerm && !selectedTerm.isActive && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg p-2 text-xs font-medium w-full md:w-auto">
            <Info className="h-4 w-4 shrink-0" />
            <span>You are viewing a historical semester. Changes will not impact the active live environment.</span>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 my-4" />

      {/* Search & Collapsible Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-10 text-sm border-blue-100 focus-visible:ring-blue-300 bg-white shadow-sm"
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

          {/* Result Count */}
          <span className="text-xs text-slate-400 ml-auto whitespace-nowrap bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 hidden sm:block">
            Showing <span className="font-semibold text-slate-700">{filteredCount}</span> organization{filteredCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Results count on mobile */}
        <div className="flex sm:hidden items-center justify-between px-1 text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredCount}</span> result{filteredCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Collapsible Panel */}
        {isExpanded && (
          <div className="bg-slate-50/50 rounded-xl p-4 border border-blue-50/55 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Level Filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Org Level</span>
              <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as OrgLevel | "all")}>
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

            {/* Tier Filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Subscription Tier</span>
              <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as any)}>
                <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="premium">Premium Tier</SelectItem>
                  <SelectItem value="plus">Plus Tier</SelectItem>
                  <SelectItem value="basic">Basic Tier</SelectItem>
                  <SelectItem value="none">Unsubscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Subscription Status</span>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-full h-9.5 text-sm border-blue-50 bg-white">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired Only</SelectItem>
                  <SelectItem value="not_subscribed">Not Subscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
