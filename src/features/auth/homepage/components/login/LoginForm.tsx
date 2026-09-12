"use client";

import { Mail, Lock, AlertCircle, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useLogin } from "./useLogin";

export function LoginForm() {
  const {
    email,
    password,
    isLoading,
    error,
    emailError,
    passwordError,
    successMessage,
    showPassword,
    rememberMe,
    setShowPassword,
    setRememberMe,
    handleEmailChange,
    handlePasswordChange,
    handleSubmit,
    handlePasswordReset,
  } = useLogin();

  const inputClass = (hasError: boolean) =>
    cn(
      "h-11 w-full rounded-md border bg-transparent pl-10 pr-4 text-sm text-foreground outline-none transition-colors",
      "placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-blue-100 focus:border-blue-300",
      hasError ? "border-destructive focus:ring-red-100 focus:border-destructive" : "border-slate-200",
    );

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-5">
        {/* Heading */}
        <div>
          <h2 className="text-3xl uppercase font-extrabold bg-gradient-to-r from-[#030677] to-[#2563eb] bg-clip-text text-transparent">Console Access.</h2>
          <p className="mt-2 text-sm font-medium bg-gradient-to-r from-[#2563eb] to-[#93c5fd] bg-clip-text text-transparent">
            Sign in with your VERIS Super Admin credentials to access the admin console.
          </p>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="veris-eyebrow block">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              className={inputClass(!!emailError)}
              disabled={isLoading}
              placeholder="you@org.edu"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
              autoComplete="email"
            />
          </div>
          {emailError && (
            <Alert className="mt-2 animate-fade-in-up border-transparent bg-gradient-to-r from-red-600 to-red-300 text-white">
              <AlertCircle className="h-4 w-4 text-white" />
              <AlertDescription className="text-white">{emailError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="veris-eyebrow">
              Password
            </label>
            <button
              type="button"
              onClick={handlePasswordReset}
              className="text-xs font-medium text-primary hover:underline"
              tabIndex={isLoading ? -1 : 0}
            >
              Forgot?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={handlePasswordChange}
              className={cn(inputClass(!!passwordError), "pr-11")}
              disabled={isLoading}
              placeholder="Enter your password"
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? "password-error" : undefined}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {passwordError && (
            <Alert className="mt-2 animate-fade-in-up border-transparent bg-gradient-to-r from-red-600 to-red-300 text-white">
              <AlertCircle className="h-4 w-4 text-white" />
              <AlertDescription className="text-white">{passwordError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <Alert className="animate-fade-in-up border-transparent bg-gradient-to-r from-red-600 to-red-300 text-white">
            <AlertCircle className="h-4 w-4 text-white" />
            <AlertDescription className="text-white">{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Message Display */}
        {successMessage && (
          <Alert className="animate-fade-in-up border-transparent bg-gradient-to-r from-green-600 to-green-300 text-white">
            <Check className="h-4 w-4 text-white" />
            <AlertDescription className="text-white">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Remember Me */}
        <label htmlFor="remember" className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            id="remember"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="sr-only"
            disabled={isLoading}
          />
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
              rememberMe ? "border-slate-500 bg-transparent text-slate-700" : "border-slate-300 bg-transparent"
            )}
          >
            {rememberMe && <Check className="size-3" strokeWidth={3} />}
          </span>
          Keep me signed in on this device
        </label>

        {/* Sign In Button */}
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-between rounded-md bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          <span>{isLoading ? "Authenticating…" : "Access System Console"}</span>
          <ArrowRight className="size-4" />
        </button>
      </form>
    </div>
  );
}
