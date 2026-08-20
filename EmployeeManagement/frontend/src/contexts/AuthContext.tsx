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
  code: string;
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

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

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
      setUser(response.data.user);
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
    setUser(response.data.user);
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
