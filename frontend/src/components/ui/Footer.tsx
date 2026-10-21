"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  const pathname = usePathname();

  // Hide footer on dashboard and package details pages
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/packages')) {
    return null;
  }

  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between gap-6">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-gray-400 max-w-xs">
            Porch-theft prevention that watches behaviour, not faces.
          </p>
        </div>
        <nav className="flex flex-wrap gap-6 text-sm font-medium text-gray-500">
          <Link href="/dashboard" className="hover:text-black transition-colors">Dashboard</Link>
          <Link href="/login" className="hover:text-black transition-colors">Log in</Link>
          <Link href="/signup" className="hover:text-black transition-colors">Sign up</Link>
        </nav>
      </div>
      <div className="border-t border-gray-100">
        <p className="max-w-6xl mx-auto px-6 py-4 text-xs text-gray-400">
          © 2026 DemaFur · Amazon Developer Hackathon
        </p>
      </div>
    </footer>
  );
}
