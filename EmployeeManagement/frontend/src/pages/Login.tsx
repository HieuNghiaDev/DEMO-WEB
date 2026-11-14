import { ButtonSpinner } from '../components/loading'
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { getLoginDestination } from "../utils/authNavigation";
import AuthChallengePage from '../features/authentication/AuthChallengePage';
import AuthPageLayout from '../features/authentication/AuthPageLayout';
import { Link } from 'react-router-dom';

type LoginErrorResponse = {
  message?: string;
  errors?: {
    email?: string[];
    password?: string[];
  };
};

type LoginLocationState = {
  from?: string;
  message?: string;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, login, authState, authFlow } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const requestedDestination =
    (location.state as LoginLocationState | null)?.from || "/";
  const destination = getLoginDestination(requestedDestination, user?.must_change_password);
  const successMessage = (location.state as LoginLocationState | null)?.message;

  useEffect(() => {
    if (!isLoading && user) {
      if (authFlow.getSnapshot().phase === 'authenticated') {
        window.sessionStorage.setItem('themis_login_notification', JSON.stringify({ createdAt: new Date().toISOString() }));
      }
      navigate(destination, { replace: true });
    }
  }, [authFlow, destination, isLoading, navigate, user]);

  useEffect(() => () => authFlow.reset(), [authFlow]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const authenticated = await login({
        email: email.trim().toLowerCase(),
        password,
        remember,
      });

      setPassword('');
      if (!authenticated) { setErrorMessage(authFlow.getSnapshot().error); return; }

      // Auth state is committed asynchronously. The effect above performs the
      // navigation only after `user` is available, preventing ProtectedRoute
      // from observing a transient null user and returning to this page.
    } catch (error) {
      if (axios.isAxiosError<LoginErrorResponse>(error)) {
        if (!error.response) {
          setErrorMessage("サーバーに接続できませんでした。");
          return;
        }

        const responseData = error.response.data;

        setErrorMessage(
          responseData?.errors?.email?.[0] ??
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

  const showChallenge = !['idle', 'submitting_password', 'authenticated'].includes(authState.phase);

  return (
    <AuthPageLayout compact={showChallenge}>
      {showChallenge ? <AuthChallengePage /> : <>
        <div className="mb-8 hidden items-center justify-between lg:flex">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]">
              <BadgeCheck size={21} />
            </span>
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.18em] text-slate-800">
                THEMIS WORKSPACE
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Verified employee access
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100/80 bg-emerald-50/80 px-2.5 py-1.5 text-[9px] font-bold text-emerald-600 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            PROTECTED
          </span>
        </div>

        <div className="mb-7">
          <p className="text-[11px] font-bold tracking-[0.16em] text-indigo-500">
            EMPLOYEE PORTAL
          </p>
          <h2 className="mt-2 text-[1.8rem] font-bold tracking-[-0.035em] text-slate-900">
            <span className="lg:hidden">社員ログイン</span>
            <span className="hidden lg:inline">おかえりなさい</span>
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            メールアドレスで社員アカウントにログイン
          </p>
        </div>

        <form className="space-y-4.5" onSubmit={handleSubmit}>
          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-5 text-emerald-700">
              {successMessage}
            </div>
          )}
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-xs font-bold text-slate-600"
            >
              メールアドレス
            </label>
            <div className="group relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-xl bg-gradient-to-br from-white to-indigo-50 p-2 text-slate-400 shadow-[0_5px_14px_rgba(71,75,130,0.10),inset_0_0_0_1px_rgba(148,163,184,0.12)] transition duration-200 group-hover:text-indigo-400 group-focus-within:-translate-y-[55%] group-focus-within:text-indigo-600 group-focus-within:shadow-[0_7px_16px_rgba(79,70,229,0.16),inset_0_0_0_1px_rgba(129,140,248,0.24)]"
              />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@themis.local"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                disabled={isSubmitting}
                className="h-14 w-full rounded-2xl border border-white/90 bg-white/65 pl-14 pr-4 text-[15px] font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(148,163,184,0.10),0_7px_20px_rgba(54,65,120,0.06)] outline-none transition duration-200 placeholder:text-slate-300 hover:-translate-y-px hover:bg-white/85 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_10px_24px_rgba(54,65,120,0.10)] focus:-translate-y-px focus:border-indigo-300 focus:bg-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_12px_28px_rgba(79,70,229,0.13)] focus:ring-4 focus:ring-indigo-100/70 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-xs font-bold text-slate-600"
            >
              パスワード
            </label>
            <div className="group relative">
              <LockKeyhole
                size={18}
                className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-xl bg-gradient-to-br from-white to-indigo-50 p-2 text-slate-400 shadow-[0_5px_14px_rgba(71,75,130,0.10),inset_0_0_0_1px_rgba(148,163,184,0.12)] transition duration-200 group-hover:text-indigo-400 group-focus-within:-translate-y-[55%] group-focus-within:text-indigo-600 group-focus-within:shadow-[0_7px_16px_rgba(79,70,229,0.16),inset_0_0_0_1px_rgba(129,140,248,0.24)]"
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="パスワードを入力"
                autoComplete="current-password"
                disabled={isSubmitting}
                className="h-14 w-full rounded-2xl border border-white/90 bg-white/65 pl-14 pr-12 text-[15px] font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(148,163,184,0.10),0_7px_20px_rgba(54,65,120,0.06)] outline-none transition duration-200 placeholder:text-slate-300 hover:-translate-y-px hover:bg-white/85 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_10px_24px_rgba(54,65,120,0.10)] focus:-translate-y-px focus:border-indigo-300 focus:bg-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_12px_28px_rgba(79,70,229,0.13)] focus:ring-4 focus:ring-indigo-100/70 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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

          <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-500">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4.5 w-4.5 rounded border-slate-300 accent-indigo-600"
            />
            ログイン状態を保持する
          </label>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-5 text-red-600"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="themis-auth-primary group flex h-14 w-full items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <ButtonSpinner size={18} />
                処理中…
              </>
            ) : (
              <>
                ログイン
                <ArrowRight
                  size={17}
                  className="motion-safe:transition motion-safe:group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>
        </form>
        <Link to="/activate-account" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          <KeyRound size={16} className="shrink-0" aria-hidden="true" />
          招待コードでアカウントを有効化
        </Link>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck size={13} className="text-emerald-500" />
          接続は安全に保護されています
        </div>
      </>}
    </AuthPageLayout>
  );
}
