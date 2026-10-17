interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: "default" | "danger" | "warning" | "success";
  icon?: "package" | "clock" | "alert" | "archive";
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  status = "default",
  icon = "package",
  loading = false,
}: StatCardProps) {
  const statusConfig = {
    default: {
      valueText: "text-zinc-950",
      iconBg: "bg-zinc-100 text-zinc-700 border-zinc-200/80",
      badge: "bg-zinc-100 text-zinc-600",
      border: "border-gray-200/80 hover:border-gray-300",
    },
    success: {
      valueText: "text-emerald-600",
      iconBg: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
      badge: "bg-emerald-50 text-emerald-700",
      border: "border-emerald-200/70 hover:border-emerald-300",
    },
    warning: {
      valueText: "text-amber-600",
      iconBg: "bg-amber-50 text-amber-600 border-amber-200/60",
      badge: "bg-amber-50 text-amber-700",
      border: "border-amber-200/80 hover:border-amber-300",
    },
    danger: {
      valueText: "text-red-600",
      iconBg: "bg-red-50 text-red-600 border-red-200/60",
      badge: "bg-red-50 text-red-700",
      border: "border-red-200/80 hover:border-red-300",
    },
  }[status];

  return (
    <div
      className={`bg-white p-5 sm:p-6 border ${statusConfig.border} rounded-2xl shadow-xs transition-all duration-200 flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-gray-500">
          {title}
        </span>
        <div
          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${statusConfig.iconBg}`}
        >
          {icon === "package" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          )}
          {icon === "clock" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {icon === "alert" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {icon === "archive" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        {loading ? (
          <div className="h-9 w-16 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <p className={`text-3xl sm:text-4xl font-black tracking-tight font-mono ${statusConfig.valueText}`}>
            {value}
          </p>
        )}
        {subtitle && (
          <span className="text-[11px] font-medium text-gray-400 truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
