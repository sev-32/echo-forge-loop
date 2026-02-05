import { cn } from "@/lib/utils";
import { 
  Activity, 
  Clock, 
  Cpu, 
  Database, 
  FileText, 
  GitBranch, 
  List, 
  Play, 
  Pause, 
  Square, 
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap
} from "lucide-react";

interface StatusIndicatorProps {
  status: 'ok' | 'warning' | 'critical' | 'exhausted' | 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  showLabel?: boolean;
}

export function StatusIndicator({ status, size = 'md', pulse = false, showLabel = false }: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const statusColors = {
    ok: 'bg-status-success',
    warning: 'bg-status-warning',
    critical: 'bg-status-error',
    exhausted: 'bg-status-error',
    idle: 'bg-muted-foreground',
    running: 'bg-status-active',
    paused: 'bg-status-warning',
    stopped: 'bg-muted-foreground',
    error: 'bg-status-error',
  };

  const statusLabels = {
    ok: 'OK',
    warning: 'Warning',
    critical: 'Critical',
    exhausted: 'Exhausted',
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
    error: 'Error',
  };

  return (
    <div className="flex items-center gap-2">
      <span 
        className={cn(
          'rounded-full',
          sizeClasses[size],
          statusColors[status],
          pulse && (status === 'running' || status === 'ok') && 'status-pulse'
        )} 
      />
      {showLabel && (
        <span className="text-sm text-muted-foreground">{statusLabels[status]}</span>
      )}
    </div>
  );
}

interface BudgetMeterProps {
  label: string;
  used: number;
  max: number;
  unit?: string;
  showPercentage?: boolean;
}

export function BudgetMeter({ label, used, max, unit = '', showPercentage = true }: BudgetMeterProps) {
  const percentage = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  
  const getBarColor = () => {
    if (percentage >= 100) return 'bg-budget-critical';
    if (percentage >= 90) return 'bg-budget-critical';
    if (percentage >= 75) return 'bg-budget-warning';
    return 'bg-budget-safe';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {used.toLocaleString()}{unit} / {max.toLocaleString()}{unit}
          {showPercentage && <span className="text-muted-foreground ml-1">({percentage}%)</span>}
        </span>
      </div>
      <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all duration-300', getBarColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface TaskStatusBadgeProps {
  status: 'queued' | 'active' | 'blocked' | 'done' | 'failed' | 'canceled';
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = {
    queued: { bg: 'bg-node-queued', icon: Clock, label: 'Queued' },
    active: { bg: 'bg-node-active', icon: Activity, label: 'Active' },
    blocked: { bg: 'bg-node-blocked', icon: AlertTriangle, label: 'Blocked' },
    done: { bg: 'bg-node-done', icon: CheckCircle2, label: 'Done' },
    failed: { bg: 'bg-node-failed', icon: XCircle, label: 'Failed' },
    canceled: { bg: 'bg-muted', icon: Square, label: 'Canceled' },
  };

  const { bg, icon: Icon, label } = config[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', bg, 'text-white')}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

interface EventTypeBadgeProps {
  type: string;
}

export function EventTypeBadge({ type }: EventTypeBadgeProps) {
  const getConfig = () => {
    if (type.includes('ERROR') || type.includes('FAILED')) {
      return { bg: 'bg-status-error/20 text-status-error border-status-error/30' };
    }
    if (type.includes('WARNING') || type.includes('BUDGET')) {
      return { bg: 'bg-status-warning/20 text-status-warning border-status-warning/30' };
    }
    if (type.includes('PASSED') || type.includes('DONE') || type.includes('CREATED')) {
      return { bg: 'bg-status-success/20 text-status-success border-status-success/30' };
    }
    if (type.includes('STOP')) {
      return { bg: 'bg-status-error/20 text-status-error border-status-error/30' };
    }
    return { bg: 'bg-surface-2 text-muted-foreground border-border' };
  };

  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded border text-xs font-mono', getConfig().bg)}>
      {type}
    </span>
  );
}

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function Panel({ title, icon, children, className, actions }: PanelProps) {
  return (
    <div className={cn('bg-card rounded-lg border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary">{icon}</span>}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {actions}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md';
  title?: string;
}

export function IconButton({ icon, onClick, disabled, variant = 'default', size = 'md', title }: IconButtonProps) {
  const variants = {
    default: 'bg-surface-2 hover:bg-surface-3 text-foreground',
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    danger: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
  };

  const sizes = {
    sm: 'p-1.5',
    md: 'p-2',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size]
      )}
    >
      {icon}
    </button>
  );
}

export const Icons = {
  Activity,
  Clock,
  Cpu,
  Database,
  FileText,
  GitBranch,
  List,
  Play,
  Pause,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
};
