import { cn } from "@/lib/utils";
import { SymmetricWave } from "@/components/ui/symmetric-wave";

interface LoadingOverlayProps {
  loading: boolean;
  message?: string;
  className?: string;
}

export function LoadingOverlay({
  loading,
  message = "Please wait...",
  className,
}: LoadingOverlayProps) {
  if (!loading) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[4px] bg-background/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="text-[#2563eb] dark:text-[#93c5fd] mb-3">
        <SymmetricWave className="text-2xl" />
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-neutral-400">{message}</p>
    </div>
  );
}
