import axios from "axios";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

type PasswordErrorResponse = {
  message?: string;
  errors?: Record<string, string[]>;
};

const hasSpecialCharacter = (value: string) => /[\p{P}\p{S}]/u.test(value);

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const passwordRequirements = [
    { label: "11文字以上", met: password.length >= 11 },
    { label: "大文字を含む", met: /[A-Z]/.test(password) },
    { label: "記号を含む", met: hasSpecialCharacter(password) },
  ];

  const isPasswordValid = passwordRequirements.every(({ met }) => met);
  const passwordsMatch = password !== "" && password === passwordConfirmation;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isPasswordValid) {
      setErrorMessage(
        "新しいパスワードは11文字以上で、大文字と記号を含めてください。",
      );
      return;
    }

    if (!passwordsMatch) {
      setErrorMessage("新しいパスワードと確認用パスワードが一致しません。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      await changePassword({
        currentPassword,
        password,
        passwordConfirmation,
      });
      navigate("/login", {
        replace: true,
        state: {
          from: "/",
          message:
            "パスワードを変更しました。新しいパスワードでログインしてください。",
        },
      });
    } catch (error) {
      if (axios.isAxiosError<PasswordErrorResponse>(error)) {
        const errors = error.response?.data?.errors;
        setErrorMessage(
          errors
            ? Object.values(errors).flat()[0]
            : (error.response?.data?.message ??
                "パスワードを変更できませんでした。"),
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const currentPasswordType = showCurrentPassword ? "text" : "password";
  const inputType = showPasswords ? "text" : "password";
  const displayName = user?.employee?.full_name ?? user?.name ?? "社員";

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

      {/* LEFT: giữ đúng cấu trúc và kích thước của Login.tsx */}
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
            SECURE ACCOUNT UPDATE
          </span>

          <h2 className="mt-7 text-[2.7rem] font-bold leading-[1.28] tracking-[-0.035em] text-white xl:text-[3.4rem]">
            安全なパスワードで、
            <br />
            仕事を
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              守る
            </span>
            。
          </h2>

          <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400 xl:text-[15px]">
            一時パスワードの利用を終了し、新しいパスワードへ更新。
            <br />
            安全な社員アカウントで仕事を続けましょう。
          </p>

          <div className="mt-9 grid max-w-[36rem] grid-cols-3 gap-3">
            {[
              {
                icon: LockKeyhole,
                title: "本人確認",
                text: "現在のパスワードを確認",
              },
              {
                icon: KeyRound,
                title: "安全な更新",
                text: "強いパスワードを設定",
              },
              {
                icon: ShieldCheck,
                title: "セッション保護",
                text: "変更後に再ログイン",
              },
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
            セキュリティ保護中
          </span>
        </div>
      </section>

      {/* RIGHT: giữ đúng width/wrapper/card của Login.tsx */}
      <section className="relative z-20 flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f5f7fb] lg:w-[40%] lg:flex-none lg:bg-transparent">
        <div className="themis-login-mobile-sky absolute inset-x-0 top-0 h-[22rem] overflow-hidden bg-[radial-gradient(circle_at_82%_8%,rgba(167,139,250,0.38),transparent_36%),linear-gradient(145deg,#121a3b_0%,#283176_50%,#6d4ce8_100%)] lg:hidden">
          <span
            aria-hidden="true"
            className="themis-login-mobile-ring themis-login-mobile-ring-one"
          />
          <span
            aria-hidden="true"
            className="themis-login-mobile-ring themis-login-mobile-ring-two"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 hidden opacity-25 lg:block lg:bg-[radial-gradient(circle,rgba(255,255,255,0.85)_1px,transparent_1px)] lg:[background-size:26px_26px] lg:[mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />

        <div className="relative z-10 w-full max-w-[33rem] px-4 pb-8 pt-5 sm:px-6 lg:px-6 lg:py-4 xl:px-8">
          {/* Mobile header: cùng style Login */}
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
                SECURE
              </span>
            </div>

            <div className="pb-5 pt-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-indigo-100 backdrop-blur">
                <Building2 size={12} />
                ACCOUNT SECURITY
              </span>
              <h1 className="mt-4 text-[2rem] font-bold leading-tight text-white">
                パスワード更新
              </h1>
              <p className="mt-2 text-sm leading-6 text-indigo-100/75">
                新しいパスワードを設定してください。
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-16 bottom-5 top-24 hidden rounded-[2.5rem] bg-indigo-950/22 blur-[34px] lg:block" />

          <div className="relative rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-[0_28px_80px_rgba(49,46,129,0.16)] backdrop-blur-xl sm:p-7 lg:overflow-hidden lg:border-white/65 lg:bg-white/[0.72] lg:p-6 lg:shadow-[0_32px_90px_rgba(20,24,70,0.25),inset_0_1px_0_rgba(255,255,255,0.9)] lg:backdrop-blur-[28px] xl:p-7">
            <div className="pointer-events-none absolute inset-x-12 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-500/75 to-transparent lg:block" />
            <div className="pointer-events-none absolute -right-20 -top-24 hidden h-48 w-48 rounded-full bg-violet-300/20 blur-3xl lg:block" />

            <div className="mb-5 hidden items-center justify-between lg:flex">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)]">
                  <BadgeCheck size={21} />
                </span>
                <div>
                  <p className="text-[10px] font-extrabold tracking-[0.18em] text-slate-800">
                    THEMIS WORKSPACE
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Secure password update
                  </p>
                </div>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100/80 bg-emerald-50/80 px-2.5 py-1.5 text-[9px] font-bold text-emerald-600 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                REQUIRED
              </span>
            </div>

            <div className="mb-5">
              <p className="text-[11px] font-bold tracking-[0.16em] text-indigo-500">
                PASSWORD UPDATE
              </p>
              <h2 className="mt-2 text-[1.8rem] font-bold tracking-[-0.035em] text-slate-900">
                パスワードを変更
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {displayName}さん、一時パスワードを新しいパスワードへ更新してください。
              </p>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <PasswordField
                id="current-password"
                label="現在のパスワード"
                value={currentPassword}
                type={currentPasswordType}
                autoComplete="current-password"
                icon="lock"
                disabled={isSubmitting || isLoggingOut}
                onChange={setCurrentPassword}
                showToggle
                isVisible={showCurrentPassword}
                onToggleVisibility={() =>
                  setShowCurrentPassword((current) => !current)
                }
              />

              <PasswordField
                id="new-password"
                label="新しいパスワード"
                value={password}
                type={inputType}
                autoComplete="new-password"
                icon="key"
                disabled={isSubmitting || isLoggingOut}
                onChange={setPassword}
                showToggle
                isVisible={showPasswords}
                onToggleVisibility={() => setShowPasswords((current) => !current)}
              />

              <PasswordField
                id="password-confirmation"
                label="新しいパスワード（確認）"
                value={passwordConfirmation}
                type={inputType}
                autoComplete="new-password"
                icon="check"
                disabled={isSubmitting || isLoggingOut}
                onChange={setPasswordConfirmation}
              />

              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2">
                {passwordRequirements.map(({ label, met }) => (
                  <span
                    key={label}
                    className={`flex min-h-8 items-center justify-center gap-1 rounded-xl px-1 text-center text-[9px] font-bold transition sm:text-[10px] ${
                      met
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-white text-slate-400"
                    }`}
                  >
                    <Check size={12} className={met ? "opacity-100" : "opacity-35"} />
                    {label}
                  </span>
                ))}
              </div>


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
                disabled={
                  isSubmitting ||
                  isLoggingOut ||
                  !currentPassword ||
                  !password ||
                  !passwordConfirmation
                }
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_30px_rgba(79,70,229,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_20px_38px_rgba(79,70,229,0.38)] active:translate-y-0 active:shadow-[inset_0_2px_5px_rgba(30,27,75,0.18),0_8px_18px_rgba(79,70,229,0.24)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" />
                    変更中...
                  </>
                ) : (
                  <>
                    <KeyRound size={18} />
                    パスワードを変更
                    <ArrowRight
                      size={17}
                      className="transition group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSubmitting || isLoggingOut}
                onClick={() => void handleLogout()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <LogOut size={16} />
                )}
                ログアウト
              </button>
            </form>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <ShieldCheck size={13} className="text-emerald-500" />
              変更後、すべての端末で再ログインが必要です
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] text-slate-400 lg:hidden">
            © 2026 THEMIS HQ · EMPLOYEE WORKSPACE
          </p>
        </div>
      </section>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  type,
  autoComplete,
  icon,
  disabled,
  onChange,
  showToggle = false,
  isVisible = false,
  onToggleVisibility,
}: {
  id: string;
  label: string;
  value: string;
  type: "text" | "password";
  autoComplete: string;
  icon: "lock" | "key" | "check";
  disabled: boolean;
  onChange: (value: string) => void;
  showToggle?: boolean;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}) {
  const Icon = icon === "lock" ? LockKeyhole : icon === "key" ? KeyRound : ShieldCheck;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold text-slate-600">
        {label}
      </label>
      <div className="group relative">
        <Icon
          size={18}
          className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-xl bg-gradient-to-br from-white to-indigo-50 p-2 text-slate-400 shadow-[0_5px_14px_rgba(71,75,130,0.10),inset_0_0_0_1px_rgba(148,163,184,0.12)] transition duration-200 group-hover:text-indigo-400 group-focus-within:-translate-y-[55%] group-focus-within:text-indigo-600 group-focus-within:shadow-[0_7px_16px_rgba(79,70,229,0.16),inset_0_0_0_1px_rgba(129,140,248,0.24)]"
        />
        <input
          id={id}
          required
          type={type}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`h-12 w-full rounded-2xl border border-white/90 bg-white/65 pl-14 ${showToggle ? "pr-12" : "pr-4"} text-[15px] font-medium text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(148,163,184,0.10),0_7px_20px_rgba(54,65,120,0.06)] outline-none transition duration-200 hover:-translate-y-px hover:bg-white/85 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_10px_24px_rgba(54,65,120,0.10)] focus:-translate-y-px focus:border-indigo-300 focus:bg-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_12px_28px_rgba(79,70,229,0.13)] focus:ring-4 focus:ring-indigo-100/70 disabled:cursor-not-allowed disabled:opacity-60`}
        />
        {showToggle && onToggleVisibility && (
          <button
            type="button"
            onClick={onToggleVisibility}
            disabled={disabled}
            aria-label={isVisible ? "パスワードを隠す" : "パスワードを表示"}
            title={isVisible ? "パスワードを隠す" : "パスワードを表示"}
            className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
