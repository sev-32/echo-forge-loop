import { Loader2 } from 'lucide-react';

interface SendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export function SendButton({ onClick, disabled, isLoading }: SendButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
      title="Send"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,90%,52%)] via-[hsl(200,85%,48%)] to-[hsl(220,80%,40%)] transition-all duration-300" />
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(200,95%,60%)] via-[hsl(190,90%,50%)] to-[hsl(210,85%,45%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Animated glow ring */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          boxShadow: '0 0 12px hsl(200 90% 55% / 0.5), 0 0 24px hsl(210 85% 50% / 0.25), inset 0 1px 0 hsl(200 90% 70% / 0.4)',
        }}
      />

      {/* Shimmer sweep */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      {/* Top edge highlight */}
      <div className="absolute top-0 left-[2px] right-[2px] h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      
      {/* Icon */}
      <div className="relative z-10 flex items-center justify-center w-full h-full">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="text-white transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          >
            <path
              d="M5 12h14M13 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      
      {/* Bottom shadow */}
      <div className="absolute bottom-0 left-1 right-1 h-px bg-black/30" />
    </button>
  );
}
