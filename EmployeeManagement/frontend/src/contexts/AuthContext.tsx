import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import axios from "axios";

import api, {
  clearAuthToken,
  hasAuthToken,
  storeAuthToken,
  logoutCurrentSession,
} from "../services/api";
import { AuthFlow, type AuthSnapshot, type AuthSession } from '../features/authentication/authFlow';
import { authTransport } from '../features/authentication/authApi';

export type AuthOffice = {
  id: number;
  office_code: string;
  name: string;
  room_image_path?: string | null;
};

export type AuthEmployee = {
  id: number;
  employee_code: string;
  full_name: string;
  gender: string | null;
  avatar_path: string | null;
  status: string;
  office: AuthOffice | null;
};

export type AuthUser = {
  id: number;
  employee_id: number | null;
  login_id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  roles: AuthRole[];
  role_names: string[];
  permission_names: string[];
  employee: AuthEmployee | null;
};

export type AuthRole = {
  id: number;
  name: string;
  display_name: string;
};

type LoginCredentials = {
  email: string;
  password: string;
  remember: boolean;
};

type UserResponse = {
  user: AuthUser;
  authentication: { requires_mfa: boolean };
};

type ChangePasswordInput = {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  sessionRestoreError: boolean;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  authFlow: AuthFlow;
  authState: AuthSnapshot;
  requiresMfa: boolean;
  completeMfaAction: (kind: 'codes' | 'device' | 'opt-in', data: unknown) => void;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

const normalizeAuthUser = (user: AuthUser): AuthUser => ({
  ...user,
  // API should return a boolean, but route protection must never treat a
  // serialized "0" as truthy and force a user back to password change.
  must_change_password:
    user.must_change_password === true ||
    (user.must_change_password as unknown) === 1 ||
    (user.must_change_password as unknown) === "1",
});

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);
  const authRevisionRef = useRef(0);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [authFlow] = useState(() => new AuthFlow(authTransport, (session: AuthSession, remember) => {
    storeAuthToken(session.token, remember);
    setUser(normalizeAuthUser(session.user));
    setRequiresMfa(session.authentication.requires_mfa);
    setSessionRestoreError(false);
    // A verified new session must not wait for an older bootstrap /me promise.
    setIsLoading(false);
  }));
  const authState = useSyncExternalStore(authFlow.subscribe, authFlow.getSnapshot);

  const refreshUser = useCallback(async () => {
    const revision = authRevisionRef.current;

    if (!hasAuthToken()) {
      if (revision === authRevisionRef.current) {
        setUser(null);
        setRequiresMfa(false);
        setSessionRestoreError(false);
      }
      return;
    }

    try {
      const response = await api.get<UserResponse>("/me", {
        params: { _fresh: Date.now() },
        timeout: 30_000,
      });

      if (revision === authRevisionRef.current) {
        setUser(normalizeAuthUser(response.data.user));
        setRequiresMfa(response.data.authentication?.requires_mfa === true);
        setSessionRestoreError(false);
      }
    } catch (error) {
      // A stale /me request may finish after a successful login. It must not
      // remove the newer token or overwrite the newly authenticated user.
      if (revision === authRevisionRef.current) {
        // Only an explicit unauthenticated response proves that the token is
        // invalid or expired. A timeout, 429, or 5xx response must not log an
        // employee out simply because the server is temporarily unavailable.
        if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status ?? 0)) {
          clearAuthToken();
          setUser(null);
          setRequiresMfa(false);
          setSessionRestoreError(false);
          return;
        }

        setSessionRestoreError(true);
      }
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        await Promise.all([
          refreshUser(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 600);
          }),
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!authState.expiresAt) return;
    const timer = window.setTimeout(authFlow.expire, Math.max(0, authState.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [authFlow, authState.expiresAt]);

  useEffect(() => {
    const expireSession = () => {
      ++authRevisionRef.current; authFlow.reset(); clearAuthToken(); setUser(null); setRequiresMfa(false); setSessionRestoreError(false); setIsLoading(false);
    };
    window.addEventListener('themis-auth-expired', expireSession);
    return () => { window.removeEventListener('themis-auth-expired', expireSession); authFlow.reset(); };
  }, [authFlow]);

  useEffect(() => {
    if (!user || !hasAuthToken()) return;

    const sendHeartbeat = () => {
      if (!hasAuthToken()) return;
      void api.post("/presence/heartbeat").catch(() => {
        // Presence is best-effort. Authentication failures are handled by the
        // normal protected-route and session restoration flow.
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 30_000);
    window.addEventListener("online", sendHeartbeat);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", sendHeartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  const login = async (credentials: LoginCredentials) => {
    if (authFlow.getSnapshot().busy) return false;
    ++authRevisionRef.current;
    clearAuthToken();
    setUser(null);
    setRequiresMfa(false);
    setSessionRestoreError(false);
    return authFlow.login(credentials);
  };

  const changePassword = async (input: ChangePasswordInput) => {
    const revision = ++authRevisionRef.current;
    await api.put("/password", {
      current_password: input.currentPassword,
      password: input.password,
      password_confirmation: input.passwordConfirmation,
    }, { timeout: 30_000 });

    if (revision !== authRevisionRef.current) return;

    clearAuthToken();
    authFlow.reset();
    setRequiresMfa(false);
    setUser(null);
    setSessionRestoreError(false);
  };

  const logout = async () => {
    const revision = ++authRevisionRef.current;
    authFlow.reset();
    setRequiresMfa(false);
    const request = logoutCurrentSession();
    setUser(null);
    setSessionRestoreError(false);
    setIsLoading(false);
    try {
      await request;
    } finally {
      if (revision === authRevisionRef.current) {
        clearAuthToken();
        setUser(null);
        setSessionRestoreError(false);
      }
    }
  };

  const completeMfaAction = (kind: 'codes' | 'device' | 'opt-in', data: unknown) => {
    if (kind === 'codes') authFlow.receiveRecoveryCodes(data);
    else if (kind === 'device') authFlow.receiveDeviceChallenge(data);
    else authFlow.receiveOptInChallenge(data);
    ++authRevisionRef.current;
    // Enrollment returns a limited pre-auth challenge. Retire this browser's
    // old PAT before the clean enrollment request; other sessions are revoked
    // by the backend when enrollment is confirmed.
    if (kind !== 'codes') void logoutCurrentSession().catch(() => undefined);
    else clearAuthToken();
    setUser(null); setRequiresMfa(false); setSessionRestoreError(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        sessionRestoreError,
        login,
        authFlow,
        authState,
        requiresMfa,
        completeMfaAction,
        changePassword,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
