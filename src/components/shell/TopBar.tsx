import { Activity, Cpu, Zap, Circle, Radio } from "lucide-react";

interface TopBarProps {
  systemStatus?: 'idle' | 'active' | 'processing' | 'error';
  runId?: string;
}

export function TopBar({ systemStatus = 'idle', runId }: TopBarProps) {
  const statusConfig = {
    idle: { color: 'text-label-muted', pulse: false, label: 'IDLE' },
    active: { color: 'text-primary', pulse: true, label: 'ACTIVE' },
    processing: { color: 'text-status-warning', pulse: true, label: 'PROCESSING' },
    error: { color: 'text-status-error', pulse: false, label: 'ERROR' },
  };

  const status = statusConfig[systemStatus];

  return (
    <header className="shell-top-bar">
      {/* World Identity - Left */}
      <div className="flex items-center gap-3">
        {/* Logo Mark */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded surface-bezel flex items-center justify-center relative">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            {systemStatus === 'active' && (
              <div className="absolute inset-0 rounded amber-glow opacity-50" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-semibold tracking-[0.2em] text-label-primary">AIM-OS</span>
            <span className="text-[7px] font-mono tracking-[0.15em] text-label-engraved">COGNITIVE SYSTEM</span>
          </div>
        </div>
        
        <div className="w-px h-5 bg-border" />
        
        {/* System Status Indicator — CNC gauge */}
        <div className="flex items-center gap-2 px-2.5 py-1 surface-well rounded">
          <div className="relative">
            <Circle className={`w-2 h-2 ${status.color}`} fill="currentColor" />
            {status.pulse && (
              <Circle className={`w-2 h-2 ${status.color} absolute inset-0 animate-ping opacity-75`} fill="currentColor" />
            )}
          </div>
          <span className="text-engraved">{status.label}</span>
        </div>
      </div>

      {/* Center - Process Identity */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {runId && (
          <div className="flex items-center gap-2.5 px-3 py-1 surface-well rounded">
            <Radio className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-mono text-label-secondary tracking-wide">
              RUN:{runId.slice(0, 8).toUpperCase()}
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          </div>
        )}
      </div>

      {/* Right - Budget Gauge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 surface-well rounded">
          <Zap className="w-3 h-3 text-primary" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-mono font-semibold text-label-primary">0.00</span>
            <span className="text-engraved">USD</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 surface-well rounded">
          <Activity className="w-3 h-3 text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">0 tok</span>
        </div>
      </div>
    </header>
  );
}
