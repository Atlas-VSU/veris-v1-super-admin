export interface LoginFormData {
  email: string;
  password: string;
}

export interface LoginError {
  code: string;
  message: string;
}

export interface LoginState {
  isLoading: boolean;
  email: string;
  password: string;
  error: string | null;
}

export type LoadingMessage =
  | "Initiating super-admin access protocol..."
  | "Aligning quantum encryption keys..."
  | "Bypassing mainframe security (just kidding)..."
  | "Reticulating premium splines..."
  | "Establishing secure command center...";

export const LOADING_MESSAGES: LoadingMessage[] = [
  "Initiating super-admin access protocol...",
  "Aligning quantum encryption keys...",
  "Bypassing mainframe security (just kidding)...",
  "Reticulating premium splines...",
  "Establishing secure command center...",
];
