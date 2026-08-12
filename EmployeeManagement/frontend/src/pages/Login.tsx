import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Building2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";

type LoginErrorResponse = {
  message?: string;
  errors?: {
    login_id?: string[];
    password?: string[];
  };
};

type LoginLocationState = {
  from?: string;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, login } = useAuth();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const destination =
    (location.state as LoginLocationState | null)?.from || "/";

  useEffect(() => {
    if (!isLoading && user) {
      navigate(destination, { replace: true });
    }
  }, [destination, isLoading, navigate, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!loginId.trim() || !password) {
      setErrorMessage("社員コードとパスワードを入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      await login({
        login_id: loginId.trim(),
        password,
        remember,
      });

      navigate(destination, { replace: true });
    } catch (error) {
      if (axios.isAxiosError<LoginErrorResponse>(error)) {
        if (!error.response) {
          setErrorMessage("サーバーに接続できませんでした。");
          return;
        }

        const responseData = error.response.data;

        setErrorMessage(
          responseData?.errors?.login_id?.[0] ??
            responseData?.errors?.password?.[0] ??
            responseData?.message ??
            "ログインに失敗しました。",
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-[#f4f6fb]">
      <section className="relative hidden w-1/2 overflow-hidden bg-[#0d1125] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white">
            T
          </div>
          <div>
            <h1 className="font-bold tracking-wide text-white">THEMIS HQ</h1>
            <p className="text-xs text-gray-400">合同AI事務所</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300">
            <Building2 size={14} />
            EMPLOYEE MANAGEMENT
          </span>
          <h2 className="text-4xl font-bold leading-tight text-white">
            ひとつのワークスペースで、
            <br />
            チームをもっと身近に。
          </h2>
          <p className="mt-5 text-sm leading-7 text-gray-400">
            勤怠状況、社員情報、事務所の活動を
            一つの画面から確認できます。
          </p>
        </div>

        <p className="relative text-xs text-gray-600">© 2026 THEMIS HQ</p>
      </section>

      <section className="flex w-full items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white">
              T
            </div>
            <div>
              <div className="font-bold text-gray-900">THEMIS HQ</div>
              <div className="text-xs text-gray-400">合同AI事務所</div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-200/60 sm:p-9">
            <div className="mb-7">
              <p className="text-xs font-bold tracking-wider text-indigo-500">
                WELCOME BACK
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">
                社員ログイン
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                社員コードとパスワードを入力してください
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="login-id"
                  className="mb-2 block text-xs font-bold text-gray-600"
                >
                  社員コード
                </label>
                <div className="relative">
                  <UserRound
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    id="login-id"
                    type="text"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    placeholder="例：TM001"
                    autoComplete="username"
                    autoCapitalize="none"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm font-medium text-gray-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-xs font-bold text-gray-600"
                >
                  パスワード
                </label>
                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="パスワードを入力"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-11 pr-12 text-sm font-medium text-gray-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    aria-label={
                      showPassword
                        ? "パスワードを隠す"
                        : "パスワードを表示する"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-gray-500">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                />
                ログイン状態を保持する
              </label>

              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#635BFF] text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" />
                    処理中...
                  </>
                ) : (
                  "ログイン"
                )}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
