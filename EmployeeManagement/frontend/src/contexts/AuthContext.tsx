import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import api, { getCsrfCookie } from "../services/api";

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
  name: string | null;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  employee: AuthEmployee | null;
};

type LoginCredentials = {
  login_id: string;
  password: string;
  remember: boolean;
};

type UserResponse = {
  user: AuthUser;
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
    try {
      const response = await api.get<UserResponse>("/me");
      setUser(response.data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        await refreshUser();
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, [refreshUser]);

  const login = async (credentials: LoginCredentials) => {
    await getCsrfCookie();

    const response = await api.post<UserResponse>("/login", credentials);
    setUser(response.data.user);
  };

  const logout = async () => {
    try {
      await api.post("/logout");
    } finally {
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
