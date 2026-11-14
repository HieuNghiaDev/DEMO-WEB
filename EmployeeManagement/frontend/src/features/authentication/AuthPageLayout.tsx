import type { ReactNode } from 'react'
import { Building2, Clock3, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import './authentication.css'

export default function AuthPageLayout({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <main lang="ja" className="themis-login relative min-h-screen overflow-hidden bg-[#080d1f] lg:flex lg:bg-[linear-gradient(108deg,#080d1f_0%,#0b1027_43%,#17183e_53%,#6f7196_65%,#d9ddeb_78%,#f7f8fc_91%,#f6f3ff_100%)]">
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
            社員ワークスペース
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
        <div className={`themis-login-mobile-sky absolute inset-x-0 top-0 ${compact ? 'h-1/2' : 'h-[22rem]'} overflow-hidden bg-[radial-gradient(circle_at_82%_8%,rgba(167,139,250,0.38),transparent_36%),linear-gradient(145deg,#121a3b_0%,#283176_50%,#6d4ce8_100%)] lg:hidden`}>
          <span aria-hidden="true" className="themis-login-mobile-ring themis-login-mobile-ring-one" />
          <span aria-hidden="true" className="themis-login-mobile-ring themis-login-mobile-ring-two" />
        </div>
        <div className="pointer-events-none absolute inset-0 hidden opacity-25 lg:block lg:bg-[radial-gradient(circle,rgba(255,255,255,0.85)_1px,transparent_1px)] lg:[background-size:26px_26px] lg:[mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />

        <div className="relative z-10 w-full max-w-[33rem] px-4 pb-8 pt-5 sm:px-6 lg:px-6 lg:py-8 xl:px-8">
          <div className={compact ? 'mb-5 lg:hidden' : 'lg:hidden'}>
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
                稼働中
              </span>
            </div>

            <div className={compact ? 'hidden' : 'pb-7 pt-8'}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-wide text-indigo-100 backdrop-blur">
                <Building2 size={12} />
                社員ポータル
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
          <div className={`themis-auth-card ${compact ? 'themis-auth-card--compact' : ''} relative rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-[0_28px_80px_rgba(49,46,129,0.16)] backdrop-blur-xl sm:p-8 lg:overflow-hidden lg:border-white/65 lg:bg-white/[0.72] lg:shadow-[0_32px_90px_rgba(20,24,70,0.25),inset_0_1px_0_rgba(255,255,255,0.9)] lg:backdrop-blur-[28px] xl:p-9`}>
            <div className="pointer-events-none absolute inset-x-12 top-0 hidden h-px bg-gradient-to-r from-transparent via-indigo-500/75 to-transparent lg:block" />
            <div className="pointer-events-none absolute -right-20 -top-24 hidden h-48 w-48 rounded-full bg-violet-300/20 blur-3xl lg:block" />
            {children}
          </div>

          <p className="mt-6 text-center text-[10px] text-slate-400 lg:hidden">
            © 2026 THEMIS HQ · 社員ワークスペース
          </p>
        </div>
      </section>
    </main>
  );
}
