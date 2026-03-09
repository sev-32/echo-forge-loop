import { IconStatusActive, IconClock, IconCpu, IconGauge, IconActivity } from "@/components/icons";

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
          <IconStatusActive size={6} className="text-primary" />
          <span className="text-engraved">ITER</span>
          <span className="text-[10px] font-mono text-label-secondary">{iteration}</span>
        </div>
        
        {checkpoint && (
          <>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <IconClock size={12} className="text-label-muted" />
              <span className="text-[10px] font-mono text-label-muted">{checkpoint}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Center - Status Ticker */}
      <div className="flex items-center gap-1.5">
        <IconGauge size={12} className="text-label-muted" />
        <span className="text-[9px] font-mono text-label-engraved tracking-wide">NOMINAL</span>
      </div>

      <div className="flex-1" />

      {/* Right - System Resources */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <IconActivity size={12} className="text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">{memoryUsage}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconCpu size={12} className="text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">--</span>
        </div>
      </div>
    </footer>
  );
}
