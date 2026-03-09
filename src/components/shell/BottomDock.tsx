import { Circle, Clock, Cpu, HardDrive } from "lucide-react";

interface BottomDockProps {
  iteration?: number;
  checkpoint?: string;
  memoryUsage?: string;
}

export function BottomDock({ iteration = 0, checkpoint, memoryUsage = '0 MB' }: BottomDockProps) {
  return (
    <footer className="shell-bottom-dock">
      {/* Left - Process Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Circle className="w-1.5 h-1.5 text-primary" fill="currentColor" />
          <span className="text-engraved">ITER</span>
          <span className="text-xs font-mono text-label-secondary">{iteration}</span>
        </div>
        
        {checkpoint && (
          <>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-label-muted" />
              <span className="text-xs font-mono text-label-muted">{checkpoint}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Right - System Resources */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-label-muted" />
          <span className="text-xs font-mono text-label-muted">{memoryUsage}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-label-muted" />
          <span className="text-xs font-mono text-label-muted">--</span>
        </div>
      </div>
    </footer>
  );
}
