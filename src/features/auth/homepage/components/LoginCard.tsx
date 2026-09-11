/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { LoginForm } from "./login/LoginForm";
import Image from "next/image";
import { Settings } from "lucide-react";

export function LoginCard() {
  return (
    <div
      className="relative z-10 w-full max-w-md rounded-[32px] p-8 sm:p-10 flex flex-col gap-6"
      style={{
        background: "linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.8) 40%, rgba(255, 255, 255, 1) 80%)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        border: "1px solid rgba(255, 255, 255, 0.4)",
        boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      {/* Wordmark logo */}
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-17 place-items-center text-primary">
          <Image
            src="/images/veris-logo-superadmin.png"
            alt="VERIS Logo"
            width={80}
            height={80}
            className="object-contain w-full h-full"
          />
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] bg-gradient-to-r from-[#2563eb] to-[#93c5fd] bg-clip-text text-transparent">
            Super Admin Console
          </span>
          {/* <span className="text-xl font-extrabold uppercase bg-gradient-to-r from-[#030677] to-[#2563eb] bg-clip-text text-transparent tracking-wide leading-none">
            VERIS
          </span> */}
        </div>
      </div>

      <LoginForm />
    </div>
  );
}
