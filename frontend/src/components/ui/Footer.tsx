import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 overflow-hidden">
      {/* Big name */}
      <div className="max-w-7xl mx-auto px-6 pt-20 pb-6">
        <div className="flex flex-col sm:flex-row justify-between gap-12">
          <div className="flex-1">

            <div className="flex gap-8 text-sm font-medium text-gray-400">
              <Link href="/" className="hover:text-black transition-colors">Home</Link>
              <Link href="/dashboard" className="hover:text-black transition-colors">Dashboard</Link>
              <Link href="/login" className="hover:text-black transition-colors">Login</Link>
              <Link href="/signup" className="hover:text-black transition-colors">Sign up</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Massive brand */}
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-[15vw] font-black tracking-tighter leading-none text-black select-none pb-6">
          DemaFur
        </h2>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center text-xs text-gray-400">
          <p>© 2026 DemaFur</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-black transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-black transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
