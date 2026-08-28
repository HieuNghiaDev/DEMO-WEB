import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";

export default function ProtectedRoute() {
  const { user, isLoading, refreshUser, sessionRestoreError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(108deg,#080d1f_0%,#0d122c_42%,#24254c_60%,#777a9e_78%,#e7e9f3_100%)] text-white">
        <div className="pointer-events-none absolute inset-0 bg-slate-950/15 backdrop-blur-[2px]" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-indigo-600/22 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-36 right-[8%] h-[28rem] w-[28rem] rounded-full bg-violet-500/24 blur-[130px]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(circle,rgba(255,255,255,0.34)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />

        <div className="relative flex -translate-y-4 flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-[1.4rem] bg-indigo-500/40 blur-2xl" />
            <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] border border-white/20 bg-white/[0.09] text-2xl font-black shadow-[0_20px_55px_rgba(30,27,75,0.30),inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-xl">
              <span className="absolute inset-[5px] rounded-[1.05rem] bg-gradient-to-br from-indigo-400/90 via-indigo-500/90 to-violet-600/90" />
              <span className="relative">T</span>
            </div>
            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-[#11152f] bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.8)]" />
          </div>

          <p className="mt-6 text-sm font-bold tracking-[0.18em] text-white">
            THEMIS HQ
          </p>
          <p className="mt-2 text-[11px] tracking-[0.08em] text-slate-500">
            ワークスペースを準備しています
          </p>

          <div className="mt-8 h-2.5 w-64 overflow-hidden rounded-full border border-white/10 bg-white/[0.07] p-[2px] shadow-[inset_0_1px_3px_rgba(15,23,42,0.28)] backdrop-blur-xl">
            <div className="h-full w-[46%] rounded-full bg-gradient-to-r from-indigo-400 via-violet-300 to-purple-400 shadow-[0_0_18px_rgba(167,139,250,0.85)] [animation:themis-loading-progress_1.35s_ease-in-out_infinite]" />
          </div>

          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-300 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-300 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-300" />
          </div>
        </div>
      </div>
    );
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
        state={{ from: location.pathname }}
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
