// DemaFur mark: a shield with a parcel inside, drawn to match the Lucide icon style.
export function LogoMark({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 2.5 4 5.5v6.2c0 4.6 3.2 8.6 8 9.8 4.8-1.2 8-5.2 8-9.8V5.5l-8-3Z" fill="currentColor" />
      <path d="m8.5 10 3.5-1.8 3.5 1.8v4L12 15.8 8.5 14v-4Z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m8.5 10 3.5 1.8 3.5-1.8M12 11.8v4" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-black tracking-tighter text-black">
      <LogoMark className="w-6 h-6 text-black" />
      DemaFur
    </span>
  );
}
