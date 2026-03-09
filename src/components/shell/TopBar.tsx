import { 
  IconStatusIdle, 
  IconStatusActive, 
  IconStatusProcessing, 
  IconStatusError,
  IconBudget,
  IconActivity,
  IconRadio
} from "@/components/icons";
import { AimOSLogo } from "@/components/icons/AimOSLogo";

interface TopBarProps {
  systemStatus?: 'idle' | 'active' | 'processing' | 'error';
  runId?: string;
}

export function TopBar({ systemStatus = 'idle', runId }: TopBarProps) {
  const statusConfig = {
    idle: { Icon: IconStatusIdle, color: 'text-label-muted', pulse: false, label: 'IDLE' },
    active: { Icon: IconStatusActive, color: 'text-primary', pulse: true, label: 'ACTIVE' },
    processing: { Icon: IconStatusProcessing, color: 'text-status-warning', pulse: true, label: 'PROCESSING' },
    error: { Icon: IconStatusError, color: 'text-status-error', pulse: false, label: 'ERROR' },
  };

  const status = statusConfig[systemStatus];
  const StatusIcon = status.Icon;

  return (
    <header className="shell-top-bar">
      {/* World Identity - Left */}
      <div className="flex items-center gap-3">
        {/* Logo Mark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded surface-bezel flex items-center justify-center relative overflow-hidden">
            <img src={aimosLogo} alt="AIM-OS" className="w-7 h-7 object-contain" />
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
            <StatusIcon className={`w-3.5 h-3.5 ${status.color}`} />
            {status.pulse && (
              <div className={`absolute inset-0 ${status.color} animate-ping opacity-50`}>
                <StatusIcon className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
          <span className="text-engraved">{status.label}</span>
        </div>
      </div>

      {/* Center - Process Identity */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {runId && (
          <div className="flex items-center gap-2.5 px-3 py-1 surface-well rounded">
            <IconRadio className="w-3.5 h-3.5 text-primary" />
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
          <IconBudget className="w-3.5 h-3.5 text-primary" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-mono font-semibold text-label-primary">0.00</span>
            <span className="text-engraved">USD</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 surface-well rounded">
          <IconActivity className="w-3.5 h-3.5 text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">0 tok</span>
        </div>
      </div>
    </header>
  );
}