import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import api, {
  clearAuthToken,
  hasAuthToken,
  storeAuthToken,
} from "../services/api";

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
};

type LoginResponse = UserResponse & {
  token: string;
};

type ChangePasswordInput = {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
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

  const refreshUser = useCallback(async () => {
    if (!hasAuthToken()) {
      setUser(null);
      return;
    }

    try {
      const response = await api.get<UserResponse>("/me");
      setUser(normalizeAuthUser(response.data.user));
    } catch {
      clearAuthToken();
      setUser(null);
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

  const login = async (credentials: LoginCredentials) => {
    const response = await api.post<LoginResponse>("/login", credentials);
    storeAuthToken(response.data.token, credentials.remember);

    try {
      // The post-login route must be based on the current server state, not a
      // potentially stale login payload from before a password reset.
      const userResponse = await api.get<UserResponse>("/me");
      setUser(normalizeAuthUser(userResponse.data.user));
    } catch (error) {
      clearAuthToken();
      setUser(null);
      throw error;
    }
  };

  const changePassword = async (input: ChangePasswordInput) => {
    await api.put("/password", {
      current_password: input.currentPassword,
      password: input.password,
      password_confirmation: input.passwordConfirmation,
    });

    clearAuthToken();
    setUser(null);
  };

  const logout = async () => {
    try {
      if (hasAuthToken()) {
        await api.post("/logout");
      }
    } finally {
      clearAuthToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
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
