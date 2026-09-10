import type { ReactNode } from 'react'

type Props = {
  breadcrumb: string
  title: string
  description: string
  illustrationSrc: string
  children: ReactNode
}

/** Shared page header so operational screens keep one THEMIS visual language. */
export default function PageHeroHeader({ breadcrumb, title, description, illustrationSrc, children }: Props) {
  return (
    <header className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-r from-[#0d1424] via-[#152037] to-[#101728] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="z-10 max-w-lg min-w-0">
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-300/85" aria-label="パンくず">
            <span className="cursor-pointer transition hover:text-white">ホーム</span>
            <span className="text-slate-500">/</span>
            <span className="font-medium text-white">{breadcrumb}</span>
          </nav>
          <h1 className="m-0 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-1 text-xs text-slate-300 sm:text-sm">{description}</p>
        </div>

        <div className="pointer-events-none absolute bottom-0 right-[220px] hidden select-none items-end justify-end lg:flex xl:right-[260px]">
          <img src={illustrationSrc} alt="" aria-hidden="true" className="h-[135px] w-auto select-none object-contain opacity-95" />
        </div>

        <div className="z-10 flex w-full shrink-0 items-center justify-end gap-2.5 sm:w-auto">{children}</div>
      </div>
    </header>
  )
}
