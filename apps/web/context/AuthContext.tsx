"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setAccessToken, setAccessTokenGetter } from "@/lib/api";
import {
  confirmUser,
  getCurrentUser,
  loginUser,
  refreshTokens,
  registerUser,
} from "@/lib/api";
import type {
  AuthTokens,
  ConfirmPayload,
  EmailPasswordPayload,
  UserProfile,
} from "@/lib/types";

interface AuthContextValue {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  isLoadingUser: boolean;
  login: (payload: EmailPasswordPayload) => Promise<void>;
  register: (payload: EmailPasswordPayload) => Promise<void>;
  confirm: (payload: ConfirmPayload) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const TOKENS_KEY = "orchestryx_auth_tokens";

// Global auth context keeps token state in memory only for this browser session.
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  // Initialize auth state from localStorage on mount.
  useEffect(() => {
    const storedTokens = localStorage.getItem(TOKENS_KEY);
    if (storedTokens) {
      try {
        const parsed = JSON.parse(storedTokens) as AuthTokens;
        setTokens(parsed);
      } catch (error) {
        console.error("Failed to parse stored tokens", error);
        localStorage.removeItem(TOKENS_KEY);
      }
    }
    setIsAuthReady(true);
  }, []);

  // Keeps axios interceptor synchronized with the latest access token.
  useEffect(() => {
    const accessToken = tokens?.access_token ?? null;
    setAccessToken(accessToken);
    setAccessTokenGetter(() => accessToken);

    return () => {
      setAccessToken(null);
      setAccessTokenGetter(null);
    };
  }, [tokens]);

  const loadUser = useCallback(async () => {
    if (!tokens?.access_token) {
      setUser(null);
      return;
    }

    setIsLoadingUser(true);

    try {
      const profile = await getCurrentUser();
      setUser(profile);
    } catch (error) {
      console.error("Failed to load user profile", error);
      localStorage.removeItem(TOKENS_KEY);
      setTokens(null);
      setUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  }, [tokens?.access_token]);

  // Fetches profile whenever a valid access token is available.
  useEffect(() => {
    void Promise.resolve().then(loadUser);
  }, [loadUser]);

  const login = useCallback(async (payload: EmailPasswordPayload) => {
    const nextTokens = await loginUser(payload);
    localStorage.setItem(TOKENS_KEY, JSON.stringify(nextTokens));
    setAccessToken(nextTokens.access_token);
    setTokens(nextTokens);
  }, []);

  const register = useCallback(async (payload: EmailPasswordPayload) => {
    await registerUser(payload);
  }, []);

  const confirm = useCallback(async (payload: ConfirmPayload) => {
    await confirmUser(payload);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokens?.refresh_token) {
      return;
    }

    const nextTokens = await refreshTokens({
      refresh_token: tokens.refresh_token,
    });
    localStorage.setItem(TOKENS_KEY, JSON.stringify(nextTokens));
    setAccessToken(nextTokens.access_token);
    setTokens(nextTokens);
  }, [tokens]);

  // Clears all auth information from memory and session UI state.
  const logout = useCallback(() => {
    localStorage.removeItem(TOKENS_KEY);
    setAccessToken(null);
    setTokens(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      tokens,
      user,
      isAuthenticated: Boolean(tokens?.access_token),
      isAuthReady,
      isLoadingUser,
      login,
      register,
      confirm,
      refresh,
      logout,
    }),
    [
      tokens,
      user,
      isAuthReady,
      isLoadingUser,
      login,
      register,
      confirm,
      refresh,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
