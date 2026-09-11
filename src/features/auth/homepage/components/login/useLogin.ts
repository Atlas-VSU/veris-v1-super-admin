import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getIdToken,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/firebase/firebase.config";
import type { UseLoginReturn } from "./types";

export function useLogin(): UseLoginReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear errors on Escape
      if (e.key === "Escape") {
        setError(null);
        setEmailError(null);
        setPasswordError(null);
        setSuccessMessage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailError(null);
    setError(null);
    setSuccessMessage(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setPasswordError(null);
    setError(null);
    setSuccessMessage(null);
  };

  // Form validation function
  const validateForm = (): boolean => {
    let isValid = true;
    // Reset field errors
    setEmailError(null);
    setPasswordError(null);

    // Email validation
    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    }

    // Password validation
    if (!password) {
      setPasswordError("Password is required");
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validate form before proceeding
    if (!validateForm()) {
      return;
    }
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const idToken = await getIdToken(userCredential.user);

      // Make the API call to create the session
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }
      // Set success message
      setSuccessMessage("Login successful! Redirecting...");
      router.refresh();
      router.push("/");
    } catch (error: any) {
      console.error("Login failed", error);

      // Handle specific Firebase auth errors
      if (error.code === "auth/wrong-password") {
        setPasswordError("Invalid password. Please try again.");
      } else if (error.code === "auth/user-not-found") {
        setEmailError("No account found with this email.");
      } else if (error.code === "auth/invalid-email") {
        setEmailError("Please enter a valid email address.");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many failed login attempts. Please try again later.");
      } else if (error.code === "auth/invalid-credential") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError("An error occurred during sign in. Please try again.");
      }
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setEmailError("Please enter your email to reset your password.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage("Password reset email sent. Please check your inbox.");
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        setEmailError("No account found with this email.");
      } else if (error.code === "auth/invalid-email") {
        setEmailError("Please enter a valid email address.");
      } else {
        setError("Failed to send password reset email. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return {
    email,
    password,
    isLoading,
    error,
    emailError,
    passwordError,
    successMessage,
    showPassword,
    rememberMe,
    setEmail,
    setPassword,
    setShowPassword,
    setRememberMe,
    handleEmailChange,
    handlePasswordChange,
    handleSubmit,
    handlePasswordReset,
  };
}
