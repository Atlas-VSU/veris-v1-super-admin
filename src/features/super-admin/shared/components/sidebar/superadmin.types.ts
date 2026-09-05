import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  Archive,
  RefreshCw,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/super-admin/dashboard", icon: LayoutDashboard },
  { label: "Organizations", href: "/super-admin/organizations", icon: Building2 },
  { label: "Terms Management", href: "/super-admin/terms", icon: Calendar },
  { label: "Organization Accounts", href: "/super-admin/org-accounts", icon: Users },
  { label: "Archive Students", href: "/super-admin/archive-students", icon: Archive },
  { label: "Sync Roster", href: "/super-admin/roster-sync", icon: RefreshCw },
];

export interface SidebarUser {
  name?: string;
  email?: string;
}

export interface SuperAdminSidebarProps {
  user?: SidebarUser;
  className?: string;
}

export interface SidebarNavProps {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export interface SidebarFooterProps {
  user?: SidebarUser;
  collapsed?: boolean;
  onSignOut: () => void;
  hideSeparator?: boolean;
  className?: string;
}

export interface SidebarBrandProps {
  collapsed?: boolean;
}