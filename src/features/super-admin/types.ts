// Super Admin Types 
// All data shapes are read-only mirrors of Firestore documents.
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  LogOut,
  Archive,
  RefreshCw,
} from "lucide-react";
export type OrgLevel = "department" | "faculty" | "council";
export type SubscriptionTier = "basic" | "plus" | "premium";
export type SortOption = "name-asc" | "name-desc" | "date-newest" | "date-oldest";

export interface SuperAdminOrg {
  id: string;
  name: string;
  shortName: string;
  level: OrgLevel;
  facultyId: string | null;
  facultyName: string | null;
  facultyAcronym: string | null;
  programId: string | null;
  programName: string | null;
  programAcronym: string | null;
  isArchived: boolean;
  subscribed: boolean;
  subscriptionTier: SubscriptionTier | null;
  adviser?: string | null;
  president?: string | null;
  orgAuditorName?: string | null;
  orgAuditorNumber?: string | null;
  orgAuditorUrl?: string | null;
  orgLogoUrl?: string | null;
  orgTreasurerName?: string | null;
  orgTreasurerNumber?: string | null;
  orgTreasurerUrl?: string | null;
  contactEmail?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

export interface SuperAdminOrgAccount {
  id: string;
  orgId: string;
  orgName: string | null;
  positionName: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
}

export interface SuperAdminFaculty {
  id: string;
  name: string;
  acronym: string;
}

export interface SuperAdminProgram {
  id: string;
  name: string;
  acronym: string;
  facultyId: string;
}

// Dashboard aggregate stats 
export interface DashboardStats {
  totalSubscribed: number;
  tierCounts: {
    basic: number;
    plus: number;
    premium: number;
  };
  totalActiveAccounts: number;
  totalArchived: number;
  totalOrgs: number;
}

export interface Term {
  id?: string;
  AY: string;
  semester: string;
  isActive: boolean;
  isDeleted?: boolean;
  metadata?: {
    createdAt: Date | string;
    updatedAt: Date | string;
  };
}

export interface OrgSubscription {
  id?: string;
  organizationId: string;
  termId: string;
  subscriptionTier: SubscriptionTier | null;
  subscriptionStatus: "active" | "expiring_soon" | "expired" | "not_subscribed" | "inactive" | "grace_period";
  startsAt?: string | null;
  expiresAt: string | null;
  renewedAt?: string | null;
  renewedBy?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;

  // Payments integration properties retained for frontend demonstration
  amountPaid: number;
  paymentReference: string | null;
  paymentMethod: string | null;
}

//  Full data payload returned by the server data layer 
export interface SuperAdminPageData {
  orgs: SuperAdminOrg[];
  accounts: SuperAdminOrgAccount[];
  stats: DashboardStats;
}

export const superAdminData = {
  mobileNavLinks: [
    {
      label: "Dashboard",
      icon: "layout-dashboard",
      href: "/super-admin/dashboard",
    },
    {
      label: "Organizations",
      icon: "building-2",
      href: "/super-admin/organizations",
    },
    {
      label: "Terms",
      icon: "calendar",
      href: "/super-admin/terms",
    },
    {
      label: "Accounts",
      icon: "users",
      href: "/super-admin/org-accounts",
    },
    {
      label: "Archive",
      icon: "archive",
      href: "/super-admin/archive-students",
    },
    {
      label: "Sync Roster",
      icon: "refresh-cw",
      href: "/super-admin/roster-sync",
    },
    {
      label: "Logout",
      icon: "logout",
      href: "/",
      action: "signout",
    },
  ],
};

// Mobile icon map
export const mobileIconMap = {
  "layout-dashboard": LayoutDashboard,
  "building-2": Building2,
  "users": Users,
  "calendar": Calendar,
  "logout": LogOut,
  "archive": Archive,
  "refresh-cw": RefreshCw,
};

export interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export interface SuperAdminOrgAccountsPageProps {
  accounts: SuperAdminOrgAccount[];
  orgs: SuperAdminOrg[];
}