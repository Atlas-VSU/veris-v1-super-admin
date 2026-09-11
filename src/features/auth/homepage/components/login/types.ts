export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface LoginFormState {
  isLoading: boolean;
  error: string | null;
  emailError: string | null;
  passwordError: string | null;
  successMessage: string | null;
  showPassword: boolean;
  rememberMe: boolean;
}

export interface UseLoginReturn extends LoginFormState {
  email: string;
  password: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setShowPassword: (show: boolean) => void;
  setRememberMe: (remember: boolean) => void;
  handleEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handlePasswordReset: () => Promise<void>;
}
