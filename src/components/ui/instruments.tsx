// ─── GaugeRadial — CNC-machined circular gauge ──────────
// A precision radial gauge with bezel ring, tick marks, and animated fill

interface GaugeRadialProps {
  value: number;       // 0-100
  label?: string;
  sublabel?: string;
  size?: number;       // px, default 80
  strokeWidth?: number;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  showTicks?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--status-success))',
  warning: 'hsl(var(--status-warning))',
  error: 'hsl(var(--status-error))',
  info: 'hsl(var(--status-info))',
};

export function GaugeRadial({ 
  value, label, sublabel, size = 80, strokeWidth = 4, 
  color = 'primary', showTicks = true 
}: GaugeRadialProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth * 2 - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;
  const fillColor = COLOR_MAP[color] || COLOR_MAP.primary;
  
  // Auto-color based on value
  const autoColor = clamped >= 80 ? COLOR_MAP.success : clamped >= 50 ? COLOR_MAP.warning : COLOR_MAP.error;
  const activeColor = color === 'primary' ? autoColor : fillColor;

  // Tick marks (12 positions like a clock)
  const ticks = showTicks ? Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const outerR = radius + strokeWidth + 2;
    const innerR = radius + strokeWidth - 1;
    return {
      x1: center + Math.cos(rad) * innerR,
      y1: center + Math.sin(rad) * innerR,
      x2: center + Math.cos(rad) * outerR,
      y2: center + Math.sin(rad) * outerR,
    };
  }) : [];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Bezel ring */}
          <circle cx={center} cy={center} r={radius + strokeWidth + 3} 
            fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
          
          {/* Track */}
          <circle cx={center} cy={center} r={radius} 
            fill="none" stroke="hsl(var(--surface-well))" strokeWidth={strokeWidth} />
          
          {/* Tick marks */}
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke="hsl(var(--border))" strokeWidth="0.75" />
          ))}
          
          {/* Fill arc */}
          <circle cx={center} cy={center} r={radius}
            fill="none" stroke={activeColor} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 3px ${activeColor})` }}
          />
        </svg>
        
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-xs font-mono font-bold text-label-primary" style={{ color: activeColor }}>
            {clamped.toFixed(0)}
          </span>
        </div>
      </div>
      
      {label && <span className="text-[9px] font-mono font-semibold text-label-primary tracking-wide">{label}</span>}
      {sublabel && <span className="text-[8px] text-label-muted">{sublabel}</span>}
    </div>
  );
}

// ─── Sparkline — Inline trend indicator ─────────────────

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  showDots?: boolean;
  fill?: boolean;
}

export function Sparkline({ 
  data, width = 80, height = 24, color = 'primary', showDots = false, fill = true 
}: SparklineProps) {
  if (data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  
  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: padding + (1 - (v - min) / range) * (height - padding * 2),
  }));
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  
  const strokeColor = COLOR_MAP[color] || COLOR_MAP.primary;
  
  // Trend indicator
  const trend = data[data.length - 1] - data[0];
  
  return (
    <div className="inline-flex items-center gap-1">
      <svg width={width} height={height} className="overflow-visible">
        {fill && (
          <path d={fillPath} fill={strokeColor} opacity="0.1" />
        )}
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {showDots && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 2.5 : 1.5}
            fill={i === points.length - 1 ? strokeColor : 'transparent'}
            stroke={strokeColor} strokeWidth="1" />
        ))}
      </svg>
      <span className={`text-[8px] font-mono ${trend >= 0 ? 'text-status-success' : 'text-status-error'}`}>
        {trend >= 0 ? '↑' : '↓'}
      </span>
    </div>
  );
}

// ─── CalibrationCurve — ECE visualization ───────────────

interface CalibrationCurveProps {
  bins: Array<{ predicted: number; actual: number; count: number }>;
  width?: number;
  height?: number;
}

export function CalibrationCurve({ bins, width = 200, height = 160 }: CalibrationCurveProps) {
  if (bins.length === 0) return null;
  
  const padding = { top: 12, right: 12, bottom: 24, left: 28 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  
  const toX = (v: number) => padding.left + v * plotW;
  const toY = (v: number) => padding.top + (1 - v) * plotH;
  
  // Perfect calibration line
  const perfectLine = `M ${toX(0)} ${toY(0)} L ${toX(1)} ${toY(1)}`;
  
  // Actual calibration curve
  const sorted = [...bins].sort((a, b) => a.predicted - b.predicted);
  const curvePath = sorted.map((b, i) => 
    `${i === 0 ? 'M' : 'L'} ${toX(b.predicted)} ${toY(b.actual)}`
  ).join(' ');

  // ECE score
  const totalCount = bins.reduce((s, b) => s + b.count, 0);
  const ece = totalCount > 0 
    ? bins.reduce((s, b) => s + (b.count / totalCount) * Math.abs(b.predicted - b.actual), 0)
    : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold text-label-primary tracking-wide">CALIBRATION CURVE</span>
        <span className={`text-[9px] font-mono font-bold ${ece < 0.05 ? 'text-status-success' : ece < 0.1 ? 'text-status-warning' : 'text-status-error'}`}>
          ECE: {(ece * 100).toFixed(1)}%
        </span>
      </div>
      <svg width={width} height={height} className="surface-well rounded p-1">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={toY(0)} x2={toX(v)} y2={toY(1)} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1={toX(0)} y1={toY(v)} x2={toX(1)} y2={toY(v)} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2,2" />
          </g>
        ))}
        
        {/* Perfect calibration */}
        <path d={perfectLine} fill="none" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4,3" />
        
        {/* Actual calibration */}
        <path d={curvePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 2px hsl(var(--primary) / 0.4))' }} />
        
        {/* Data points with size by count */}
        {sorted.map((b, i) => {
          const r = Math.max(2, Math.min(5, Math.sqrt(b.count) * 0.8));
          return (
            <circle key={i} cx={toX(b.predicted)} cy={toY(b.actual)} r={r}
              fill="hsl(var(--primary))" opacity="0.7" stroke="hsl(var(--background))" strokeWidth="1" />
          );
        })}
        
        {/* Axis labels */}
        <text x={toX(0.5)} y={height - 4} textAnchor="middle" className="text-[7px] fill-label-muted font-mono">Predicted Confidence</text>
        <text x={6} y={toY(0.5)} textAnchor="middle" transform={`rotate(-90, 6, ${toY(0.5)})`} className="text-[7px] fill-label-muted font-mono">Actual Accuracy</text>
        
        {/* Axis ticks */}
        {[0, 0.5, 1].map(v => (
          <g key={`axis-${v}`}>
            <text x={toX(v)} y={height - 14} textAnchor="middle" className="text-[7px] fill-label-engraved font-mono">{(v * 100).toFixed(0)}</text>
            <text x={padding.left - 4} y={toY(v) + 3} textAnchor="end" className="text-[7px] fill-label-engraved font-mono">{(v * 100).toFixed(0)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── StatusBadge — Unified status display ───────────────

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  idle: { color: 'text-label-muted', bg: 'bg-muted' },
  active: { color: 'text-status-success', bg: 'bg-status-success/15' },
  processing: { color: 'text-primary', bg: 'bg-primary/15' },
  running: { color: 'text-primary', bg: 'bg-primary/15' },
  completed: { color: 'text-status-success', bg: 'bg-status-success/15' },
  done: { color: 'text-status-success', bg: 'bg-status-success/15' },
  failed: { color: 'text-status-error', bg: 'bg-status-error/15' },
  error: { color: 'text-status-error', bg: 'bg-status-error/15' },
  warning: { color: 'text-status-warning', bg: 'bg-status-warning/15' },
  pending: { color: 'text-status-pending', bg: 'bg-status-pending/15' },
  blocked: { color: 'text-status-blocked', bg: 'bg-status-blocked/15' },
  queued: { color: 'text-label-muted', bg: 'bg-muted' },
  pass: { color: 'text-status-success', bg: 'bg-status-success/15' },
  abstain: { color: 'text-status-warning', bg: 'bg-status-warning/15' },
  fail: { color: 'text-status-error', bg: 'bg-status-error/15' },
};

export function StatusBadge({ status, size = 'sm', pulse = false }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status.toLowerCase()] || STATUS_CONFIG.idle;
  const sizeClass = size === 'sm' ? 'text-[8px] px-1.5 py-0 h-4' : 'text-[10px] px-2 py-0.5 h-5';
  
  return (
    <span className={`inline-flex items-center gap-1 rounded font-mono font-medium uppercase tracking-wider ${cfg.color} ${cfg.bg} ${sizeClass}`}>
      {pulse && <span className={`w-1.5 h-1.5 rounded-full ${cfg.color.replace('text-', 'bg-')} animate-pulse`} />}
      {status}
    </span>
  );
}
