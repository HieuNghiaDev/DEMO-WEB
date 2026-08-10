import { Clock3 } from 'lucide-react'

type ComingSoonProps = {
  title: string
}

function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <Clock3 size={32} />
        </div>

        <h1 className="text-2xl font-bold text-gray-800">
          {title}
        </h1>

        <p className="mt-5 text-lg font-semibold text-gray-700">
          Sẽ sớm được cập nhật
        </p>

        <p className="mt-2 text-gray-500">
          近日公開予定です
        </p>
      </div>
    </div>
  )
}

export default ComingSoon