import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Settings } from "lucide-react";
import { SymmetricWave } from "@/components/ui/symmetric-wave";

interface LoadingScreenProps {
  message?: string;
  className?: string;
  showDelayMessage?: boolean;
}

export function LoadingScreen({
  message = "Preparing your workspace…",
  className,
  showDelayMessage = true,
}: LoadingScreenProps) {
  const [showDelayed, setShowDelayed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDelayed(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4",
        className
      )}
    >
      <div className="bg-white rounded-lg p-6 sm:p-8 lg:p-10 shadow-2xl max-w-sm sm:max-w-md w-full mx-auto text-center flex flex-col items-center">

        {/* Brand Logo & Name */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative inline-flex">
            <div className="size-16 flex shrink-0 items-center justify-center overflow-hidden">
              <Image
                src="/images/veris-logo-superadmin.png"
                alt="VERIS Logo"
                width={64}
                height={64}
                className="object-contain w-full h-full"
              />
            </div>
            <div className="absolute -top-1.5 -right-1.5 bg-white dark:bg-neutral-900 rounded-full">
              <Settings className="size-4 text-[#2563eb] dark:text-[#93c5fd] shrink-0 animate-[spin_4s_linear_infinite]" />
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="mb-6 text-[#2563eb] dark:text-[#93c5fd]">
          <SymmetricWave className="text-xl" />
        </div>

        <div className="flex flex-col items-center gap-2 min-h-[48px] justify-center transition-all duration-300 w-full">
          <p className="text-sm sm:text-base text-slate-500 dark:text-neutral-400 text-center">
            {message}
          </p>
          {showDelayMessage && showDelayed && (
            <p className="text-xs sm:text-sm animate-[pulse_2s_ease-in-out_infinite] text-slate-400 dark:text-neutral-500 font-medium">
              Still working — hang tight...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
