import { Activity, Cpu, Zap, Circle } from "lucide-react";

interface TopBarProps {
  systemStatus?: 'idle' | 'active' | 'processing' | 'error';
  runId?: string;
}

export function TopBar({ systemStatus = 'idle', runId }: TopBarProps) {
  const statusConfig = {
    idle: { color: 'bg-label-muted', label: 'IDLE' },
    active: { color: 'bg-primary', label: 'ACTIVE' },
    processing: { color: 'bg-status-warning', label: 'PROCESSING' },
    error: { color: 'bg-status-error', label: 'ERROR' },
  };

  const status = statusConfig[systemStatus];

  return (
    <header className="shell-top-bar">
      {/* World Identity - Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded surface-raised flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-engraved">AIM-OS</span>
        </div>
        
        <div className="w-px h-4 bg-border" />
        
        {/* System Status Indicator */}
        <div className="flex items-center gap-2">
          <Circle className={`w-2 h-2 ${status.color} ${systemStatus === 'active' ? 'animate-glow-pulse' : ''}`} fill="currentColor" />
          <span className="text-engraved">{status.label}</span>
        </div>
      </div>

      {/* Center - Process Identity */}
      <div className="flex-1 flex items-center justify-center">
        {runId && (
          <div className="flex items-center gap-2 px-3 py-1 surface-well rounded">
            <Activity className="w-3 h-3 text-primary" />
            <span className="text-xs font-mono text-label-secondary">
              {runId.slice(0, 8)}
            </span>
          </div>
        )}
      </div>

      {/* Right - Global Actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 surface-well rounded">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-xs font-mono text-label-secondary">0.00</span>
          <span className="text-engraved">USD</span>
        </div>
      </div>
    </header>
  );
}
