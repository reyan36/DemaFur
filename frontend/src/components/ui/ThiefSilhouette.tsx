// Thief silhouette SVG for the entrance animation
export function ThiefSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 320"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head with mask/beanie */}
      <ellipse cx="100" cy="45" rx="28" ry="32" />
      <rect x="72" y="25" width="56" height="18" rx="4" />
      {/* Eye slit */}
      <rect x="78" y="38" width="44" height="8" rx="2" fill="white" />
      
      {/* Body - leaning forward pushing pose */}
      <path d="M75 75 L60 170 L90 175 L100 80 Z" />
      <path d="M100 80 L110 175 L140 170 L125 75 Z" />
      
      {/* Arms stretched forward (pushing) */}
      <path d="M125 90 Q155 95 175 85 L180 75 Q185 72 188 78 L185 95 Q160 115 130 110 Z" />
      <path d="M75 90 Q55 88 40 110 L35 120 Q32 125 38 126 L50 118 Q65 108 80 110 Z" />
      
      {/* Hands pushing */}
      <ellipse cx="188" cy="82" rx="8" ry="10" />
      
      {/* Legs in running/pushing stance */}
      <path d="M70 168 L45 260 L60 265 L85 175 Z" />
      <path d="M110 168 L130 255 L145 250 L120 170 Z" />
      
      {/* Feet */}
      <ellipse cx="50" cy="268" rx="18" ry="7" />
      <ellipse cx="140" cy="255" rx="18" ry="7" />
      
      {/* Package under arm */}
      <rect x="38" y="110" width="30" height="25" rx="3" fill="currentColor" stroke="white" strokeWidth="2" />
      <line x1="38" y1="122" x2="68" y2="122" stroke="white" strokeWidth="1.5" />
      <line x1="53" y1="110" x2="53" y2="135" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}
