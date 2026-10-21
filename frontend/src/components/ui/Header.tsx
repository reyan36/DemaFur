"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/ui/Logo";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" aria-label="DemaFur home">
              <Logo />
            </Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 whitespace-nowrap">
            <Link
              href="/dashboard"
              className="hidden sm:inline text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              Dashboard
            </Link>

            <div className="flex items-center gap-1 sm:gap-3 sm:border-l sm:border-gray-100 sm:pl-6">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500 hidden sm:inline-block max-w-[150px] truncate">
                    {user.displayName || user.email}
                  </span>
                  <button
                    onClick={() => logout()}
                    className="text-xs font-medium text-gray-500 hover:text-black px-3 py-1.5 rounded-lg border border-gray-200 hover:border-black transition cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-gray-500 hover:text-black px-3 py-2 transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="text-sm font-medium bg-black text-white hover:bg-gray-800 px-4 py-2 rounded-full transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
