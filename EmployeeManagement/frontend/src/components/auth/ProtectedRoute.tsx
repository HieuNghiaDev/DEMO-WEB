import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";
import { getLoginDestination } from "../../utils/authNavigation";
import { AppLoadingScreen } from "../loading";

export default function ProtectedRoute() {
  const { user, isLoading, refreshUser, sessionRestoreError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    if (sessionRestoreError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 dark:bg-slate-950">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              ログイン状態を確認できませんでした
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              セッションは保持されています。接続が回復したら、もう一度確認してください。
            </p>
            <button
              type="button"
              onClick={() => void refreshUser()}
              className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              再試行
            </button>
          </section>
        </main>
      );
    }

    return (
      <Navigate
        to="/login"
        replace
        state={{ from: getLoginDestination(location.pathname) }}
      />
    );
  }

  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!user.must_change_password && location.pathname === "/change-password") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
