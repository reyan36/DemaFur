"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  
  // Hide footer on dashboard and package details pages
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/packages')) {
    return null;
  }

  return (
    <footer className="bg-white border-t border-gray-100 overflow-hidden">
      {/* Big name */}
      <div className="max-w-7xl mx-auto px-6 pt-20 pb-6">
        <div className="flex flex-col sm:flex-row justify-between gap-12">
          <div className="flex-1">

            <div className="flex flex-wrap gap-8 text-sm font-medium text-gray-400">
              <Link href="/" className="hover:text-black transition-colors">Home</Link>
              <Link href="/dashboard" className="hover:text-black transition-colors">Dashboard</Link>
              <Link href="/login" className="hover:text-black transition-colors">Login</Link>
              <Link href="/signup" className="hover:text-black transition-colors">Sign up</Link>
              <a
                href="https://stats.uptimerobot.com/5q6oQH46Zd"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors flex items-center gap-1.5 text-emerald-600 font-mono text-xs font-semibold"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Status ↗
              </a>
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
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-400">
          <p>© 2026 DemaFur · Amazon Developer Hackathon</p>
          <div className="flex items-center gap-6">
            <a
              href="https://stats.uptimerobot.com/5q6oQH46Zd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:text-emerald-800 transition-colors flex items-center gap-1.5 font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Systems Operational
            </a>
            <Link href="#" className="hover:text-black transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-black transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
