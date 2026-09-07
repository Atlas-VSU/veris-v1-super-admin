import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function ExecuteStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="flex size-16 items-center justify-center rounded-full bg-blue-100">
        <Loader2 className="size-8 text-blue-600 animate-spin" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold text-slate-800">Synchronizing Roster</h2>
        <p className="text-sm text-slate-500">
          Creating, updating, and deactivating student records. Please do not close this page.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <Progress value={undefined} className="h-2 animate-pulse" />
      </div>
    </div>
  );
}
