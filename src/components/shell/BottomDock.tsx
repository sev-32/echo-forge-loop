import { IconStatusActive, IconClock, IconCpu, IconGauge, IconActivity } from "@/components/icons";
import { useLiveMetrics } from "@/hooks/use-live-metrics";

interface BottomDockProps {
  iteration?: number;
  checkpoint?: string;
  memoryUsage?: string;
}

export function BottomDock({ iteration = 0, checkpoint, memoryUsage = '0 MB' }: BottomDockProps) {
  const { metrics } = useLiveMetrics(6000);

  return (
    <footer className="shell-bottom-dock">
      {/* Left - Process Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <IconStatusActive size={6} className="text-primary" />
          <span className="text-engraved">RUNS</span>
          <span className="text-[10px] font-mono text-label-secondary">{metrics.totalRuns}</span>
        </div>
        
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-engraved">ATOMS</span>
          <span className="text-[10px] font-mono text-label-secondary">{metrics.atoms}</span>
        </div>

        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-engraved">RULES</span>
          <span className="text-[10px] font-mono text-label-secondary">{metrics.activeRules}</span>
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
        <span className="text-[9px] font-mono text-label-engraved tracking-wide">
          {metrics.latestRunStatus === 'running' ? 'PROCESSING' : 'NOMINAL'}
        </span>
        {metrics.avgScore != null && (
          <>
            <div className="w-px h-3 bg-border" />
            <span className="text-[9px] font-mono text-label-muted">AVG {metrics.avgScore}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Right - System Resources */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <IconActivity size={12} className="text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">{metrics.knowledgeNodes} nodes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconCpu size={12} className="text-label-muted" />
          <span className="text-[10px] font-mono text-label-muted">{metrics.witnesses} W</span>
        </div>
        {metrics.contradictions > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-status-warning">⚠ {metrics.contradictions}</span>
          </div>
        )}
      </div>
    </footer>
  );
}
