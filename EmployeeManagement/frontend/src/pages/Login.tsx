import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";

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
  const { user, isLoading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const destination =
    (location.state as LoginLocationState | null)?.from || "/";
  const successMessage = (location.state as LoginLocationState | null)?.message;

  useEffect(() => {
    if (!isLoading && user) {
      navigate(destination, { replace: true });
    }
  }, [destination, isLoading, navigate, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      await login({
        email: email.trim().toLowerCase(),
        password,
        remember,
      });

      window.sessionStorage.setItem(
        "themis_login_notification",
        JSON.stringify({ createdAt: new Date().toISOString() }),
      );

      navigate(destination, { replace: true });
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

  return (
    <main className="themis-login relative min-h-screen overflow-hidden bg-[#080d1f] lg:flex lg:bg-[linear-gradient(108deg,#080d1f_0%,#0b1027_43%,#17183e_53%,#6f7196_65%,#d9ddeb_78%,#f7f8fc_91%,#f6f3ff_100%)]">
      <div
        aria-hidden="true"
        className="themis-login-glow themis-login-glow-one pointer-events-none absolute -left-32 top-24 h-[32rem] w-[32rem] rounded-full bg-indigo-600/18 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="themis-login-glow themis-login-glow-two pointer-events-none absolute bottom-[-14rem] left-[28%] h-[34rem] w-[34rem] rounded-full bg-purple-700/22 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="themis-login-glow themis-login-glow-three pointer-events-none absolute right-[-9rem] top-[-12rem] hidden h-[34rem] w-[34rem] rounded-full bg-violet-200/35 blur-[110px] lg:block"
      />
      <div
        aria-hidden="true"
        className="themis-login-stars pointer-events-none absolute inset-0 hidden opacity-[0.22] lg:block lg:bg-[radial-gradient(circle,rgba(148,163,184,0.22)_1px,transparent_1px)] lg:[background-size:28px_28px] lg:[mask-image:linear-gradient(to_right,black,transparent_56%)]"
      />

      <section className="relative z-10 hidden min-h-screen flex-1 overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16 2xl:p-[4.5rem]">
        <div
          aria-hidden="true"
          className="themis-login-orbits pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span className="themis-login-orbit themis-login-orbit-primary">
            <i className="themis-login-orbit-node" />
          </span>
          <span className="themis-login-orbit themis-login-orbit-secondary">
            <i className="themis-login-orbit-node" />
          </span>
          <span className="themis-login-orbit themis-login-orbit-tertiary">
            <i className="themis-login-orbit-node" />
          </span>
          <span className="themis-login-orbit-core" />
        </div>

        <div className="relative flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] bg-gradient-to-br from-indigo-400 via-indigo-500 to-purple-600 text-xl font-black text-white shadow-[0_14px_35px_rgba(67,56,202,0.35)]">
            T
          </div>
          <div>
            <h1 className="font-bold tracking-[0.08em] text-white">THEMIS HQ</h1>
            <p className="mt-0.5 text-xs text-slate-500">合同AI事務所</p>
          </div>
        </div>

        <div className="relative max-w-[39rem] pb-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/15 bg-indigo-400/[0.08] px-3.5 py-2 text-[11px] font-bold tracking-[0.08em] text-indigo-200 backdrop-blur">
            <Sparkles size={14} />
            EMPLOYEE WORKSPACE
          </span>

          <h2 className="mt-7 text-[2.7rem] font-bold leading-[1.28] tracking-[-0.035em] text-white xl:text-[3.4rem]">
            今日の仕事を、
            <br />
            もっと
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              スマート
            </span>
            に。
          </h2>
          <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400 xl:text-[15px]">
            勤怠状況、社員情報、事務所の活動を一つの画面に。
            <br />
            チームの一日を、ここから始めましょう。
          </p>

          <div className="mt-9 grid max-w-[36rem] grid-cols-3 gap-3">
            {[
              { icon: Clock3, title: "かんたん勤怠", text: "出退勤をすぐ登録" },
              { icon: UsersRound, title: "チーム状況", text: "働き方を見える化" },
              { icon: ShieldCheck, title: "安心アクセス", text: "安全な社員ログイン" },
            ].map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group rounded-[1.25rem] border border-white/[0.08] bg-white/[0.045] p-4 transition hover:-translate-y-0.5 hover:border-indigo-300/20 hover:bg-white/[0.07]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-300 ring-1 ring-indigo-300/10">
                  <Icon size={16} />
                </span>
                <p className="mt-3 text-xs font-bold text-white">{title}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex max-w-[36rem] items-center justify-between text-[11px] text-slate-600">
          <span>© 2026 THEMIS HQ</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            システム稼働中
          </span>
        </div>
      </section>

      <section className="relative z-20 flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f5f7fb] lg:w-[40%] lg:flex-none lg:bg-transparent">
        <div className="themis-login-mobile-sky absolute inset-x-0 top-0 h-[22rem] overflow-hidden bg-[radial-gradient(circle_at_82%_8%,rgba(167,139,250,0.38),transparent_36%),linear-gradient(145deg,#121a3b_0%,#283176_50%,#6d4ce8_100%)] lg:hidden">
          <span aria-hidden="true" className="themis-login-mobile-ring themis-login-mobile-ring-one" />
          <span aria-hidden="true" className="themis-login-mobile-ring themis-login-mobile-ring-two" />
        </div>
        <div className="pointer-events-none absolute inset-0 hidden opacity-25 lg:block lg:bg-[radial-gradient(circle,rgba(255,255,255,0.85)_1px,transparent_1px)] lg:[background-size:26px_26px] lg:[mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />

        <div className="relative z-10 w-full max-w-[33rem] px-4 pb-8 pt-5 sm:px-6 lg:px-6 lg:py-8 xl:px-8">
          <div className="lg:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-lg font-black text-white shadow-lg backdrop-blur">
                  T
                </div>
                <div>
                  <div className="font-bold tracking-wide text-white">THEMIS HQ</div>
                  <div className="text-[11px] text-indigo-200">合同AI事務所</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-100 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ONLINE
              </span>
            </div>

            <div className="pb-7 pt-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-indigo-100 backdrop-blur">
                <Building2 size={12} />
                EMPLOYEE MANAGEMENT
              </span>
              <h1 className="mt-4 text-[2rem] font-bold leading-tight text-white">
                おかえりなさい。
              </h1>
              <p className="mt-2 text-sm leading-6 text-indigo-100/75">
                今日の仕事を、ここから始めましょう。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                  <Clock3 size={12} /> 勤怠管理
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                  <ShieldCheck size={12} /> セキュアログイン
                </span>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-16 bottom-5 top-24 hidden rounded-[2.5rem] bg-indigo-950/22 blur-[34px] lg:block" />
          <div className="relative rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-[0_28px_80px_rgba(49,46,129,0.16)] backdrop-blur-xl sm:p-8 lg:overflow-hidden lg:border-white/65 lg:bg-white/[0.72] lg:p-8 lg:shadow-[0_32px_90px_rgba(20,24,70,0.25),inset_0_1px_0_rgba(255,255,255,0.9)] lg:backdrop-blur-[28px] xl:p-9">
            <div className="pointer-events-none absolute inset-x-12 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-500/75 to-transparent lg:block" />
            <div className="pointer-events-none absolute -right-20 -top-24 hidden h-48 w-48 rounded-full bg-violet-300/20 blur-3xl lg:block" />
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
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_30px_rgba(79,70,229,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_20px_38px_rgba(79,70,229,0.38)] active:translate-y-0 active:shadow-[inset_0_2px_5px_rgba(30,27,75,0.18),0_8px_18px_rgba(79,70,229,0.24)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    ログイン
                    <ArrowRight
                      size={17}
                      className="transition group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <ShieldCheck size={13} className="text-emerald-500" />
              接続は安全に保護されています
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] text-slate-400 lg:hidden">
            © 2026 THEMIS HQ · EMPLOYEE WORKSPACE
          </p>
        </div>
      </section>
    </main>
  );
}
