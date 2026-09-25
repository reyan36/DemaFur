"use client";

import Link from "next/link";
import { User } from "lucide-react";

export function Header() {
 return (
 <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex justify-between h-16 items-center">
 
 <div className="flex-shrink-0 flex items-center">
 <Link href="/" className="text-xl font-bold tracking-tighter text-black">
 DemaFur.
 </Link>
 </div>

 <div className="flex items-center space-x-6">
 <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-black transition-colors">
 Dashboard
 </Link>
 
 <div className="flex items-center space-x-2 border-l border-gray-100 pl-6">
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
 </div>
 </div>
 </div>
 </div>
 </header>
 );
}
