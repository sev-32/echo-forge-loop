export function AimOSLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="cube-top" x1="32" y1="8" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(210, 90%, 55%)" />
          <stop offset="1" stopColor="hsl(200, 85%, 45%)" />
        </linearGradient>
        <linearGradient id="cube-left" x1="10" y1="28" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(210, 80%, 40%)" />
          <stop offset="1" stopColor="hsl(220, 70%, 30%)" />
        </linearGradient>
        <linearGradient id="cube-right" x1="32" y1="28" x2="54" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(215, 85%, 50%)" />
          <stop offset="1" stopColor="hsl(225, 75%, 35%)" />
        </linearGradient>
        <linearGradient id="facet-warm" x1="14" y1="24" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(15, 90%, 55%)" />
          <stop offset="0.5" stopColor="hsl(0, 80%, 50%)" />
          <stop offset="1" stopColor="hsl(140, 70%, 45%)" />
        </linearGradient>
        <linearGradient id="facet-cool" x1="32" y1="38" x2="26" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(160, 80%, 45%)" />
          <stop offset="1" stopColor="hsl(180, 85%, 50%)" />
        </linearGradient>
        <linearGradient id="wire-glow" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(200, 90%, 60%)" stopOpacity="0.6" />
          <stop offset="1" stopColor="hsl(190, 85%, 50%)" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Outer wireframe cube (larger, translucent) */}
      <path d="M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z" stroke="url(#wire-glow)" strokeWidth="0.75" fill="none" opacity="0.5" />
      <line x1="32" y1="4" x2="32" y2="32" stroke="url(#wire-glow)" strokeWidth="0.5" opacity="0.3" />
      <line x1="6" y1="18" x2="32" y2="32" stroke="url(#wire-glow)" strokeWidth="0.5" opacity="0.3" />
      <line x1="58" y1="18" x2="32" y2="32" stroke="url(#wire-glow)" strokeWidth="0.5" opacity="0.3" />

      {/* Top face */}
      <path d="M32 12 L50 22 L32 32 L14 22 Z" fill="url(#cube-top)" opacity="0.9" />
      
      {/* Left face */}
      <path d="M14 22 L32 32 L32 52 L14 42 Z" fill="url(#cube-left)" opacity="0.9" />
      
      {/* Right face */}
      <path d="M50 22 L50 42 L32 52 L32 32 Z" fill="url(#cube-right)" opacity="0.9" />

      {/* Colorful inner facets - warm triangle on left */}
      <path d="M14 22 L28 28 L24 38 Z" fill="url(#facet-warm)" opacity="0.85" />
      
      {/* Cool facet - bottom center */}
      <path d="M28 36 L32 42 L24 42 Z" fill="url(#facet-cool)" opacity="0.8" />

      {/* Edge highlights */}
      <path d="M32 12 L50 22 L32 32 L14 22 Z" stroke="hsl(200, 90%, 65%)" strokeWidth="0.5" fill="none" opacity="0.6" />
      <path d="M14 22 L32 32 L32 52 L14 42 Z" stroke="hsl(200, 90%, 55%)" strokeWidth="0.5" fill="none" opacity="0.4" />
      <path d="M50 22 L50 42 L32 52 L32 32 Z" stroke="hsl(210, 85%, 55%)" strokeWidth="0.5" fill="none" opacity="0.4" />

      {/* Center vertex glow */}
      <circle cx="32" cy="32" r="1.5" fill="hsl(190, 90%, 70%)" opacity="0.7" />
    </svg>
  );
}
