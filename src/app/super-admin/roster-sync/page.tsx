import type { Metadata } from "next";
import RosterSyncPage from "@/features/super-admin/roster-sync/components/RosterSyncPage";

export const metadata: Metadata = {
  title: "Synchronize Student Roster — Super Admin | VERIS",
  description:
    "Upload a current student roster to create, update, and deactivate student records so the system stays in sync with enrollment.",
};

export default function Page() {
  return <RosterSyncPage />;
}
