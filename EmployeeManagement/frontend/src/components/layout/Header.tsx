import { Bell, Search } from 'lucide-react'

function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      
      {/* Search */}
      <div className="flex w-96 items-center gap-3 rounded-lg bg-gray-100 px-4 py-2">
        <Search size={20} className="text-gray-400" />

        <input
          type="text"
          placeholder="Tìm kiếm..."
          className="w-full bg-transparent outline-none"
        />
      </div>

      {/* Right */}
      <div className="flex items-center gap-5">
        
        <button className="relative">
          <Bell size={22} className="text-gray-600" />

          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
            3
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
            A
          </div>

          <div>
            <p className="text-sm font-medium">
              Admin
            </p>

            <p className="text-xs text-gray-500">
              Administrator
            </p>
          </div>
        </div>

      </div>

    </header>
  )
}

export default Header