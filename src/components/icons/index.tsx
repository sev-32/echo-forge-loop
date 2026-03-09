// AIM-OS Custom Icon System - Sharp Technical Aesthetic
// Precision-engineered SVG icons for the cognitive orchestration interface

import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const defaultProps = {
  size: 24,
  strokeWidth: 1.5,
  fill: 'none',
  stroke: 'currentColor',
};

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconCognitive({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Brain cortex pattern */}
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      <circle cx="12" cy="12" r="7" />
      <path d="M9 9l1.5 3 3-1.5 1.5 3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconOrchestrate({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Network orchestration */}
      <rect x="3" y="3" width="6" height="6" />
      <rect x="15" y="3" width="6" height="6" />
      <rect x="9" y="15" width="6" height="6" />
      <path d="M9 6h6M6 9v3l6 3M18 9v3l-6 3" />
    </svg>
  );
}

export function IconIntelligence({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* AI conversation */}
      <path d="M4 4h16v12H6l-2 4v-4H4z" />
      <circle cx="8" cy="10" r="1.5" fill="currentColor" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconMission({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Targeting reticle */}
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconSwarm({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Multi-agent network */}
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="6" cy="16" r="2.5" />
      <circle cx="18" cy="16" r="2.5" />
      <path d="M12 8.5v3.5M8.5 14.5L11 12M15.5 14.5L13 12" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconHistory({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Timeline/history */}
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
      <path d="M4 12H2M7 5L5.5 3.5" />
    </svg>
  );
}

export function IconMemory({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Database/memory bank */}
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

export function IconJournal({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Logbook */}
      <path d="M4 4h12a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" />
      <path d="M8 8h4M8 12h6" />
    </svg>
  );
}

export function IconKnowledge({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Evidence graph */}
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M7 11l3-4M17 11l-3-4M7 13l3 4M17 13l-3 4" />
    </svg>
  );
}

export function IconTrust({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Shield verification */}
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconSettings({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Precision gear */}
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconStatusIdle({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="8" strokeDasharray="4 4" />
    </svg>
  );
}

export function IconStatusActive({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
    </svg>
  );
}

export function IconStatusProcessing({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="8" strokeDasharray="12 4" />
      <path d="M12 8v4l2 2" />
    </svg>
  );
}

export function IconStatusError({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconSend({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M4 12l16-8-4 8 4 8-16-8z" />
      <path d="M4 12h12" />
    </svg>
  );
}

export function IconExpand({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function IconCollapse({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
    </svg>
  );
}

export function IconPlay({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M6 4l14 8-14 8V4z" fill="currentColor" />
    </svg>
  );
}

export function IconPause({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="6" y="4" width="4" height="16" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" />
    </svg>
  );
}

export function IconStop({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="5" y="5" width="14" height="14" fill="currentColor" />
    </svg>
  );
}

export function IconRefresh({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M4 12a8 8 0 018-8 8 8 0 017.2 4.5" />
      <path d="M20 12a8 8 0 01-8 8 8 8 0 01-7.2-4.5" />
      <path d="M19 4v4h-4M5 20v-4h4" />
    </svg>
  );
}

export function IconAdd({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconRemove({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconClose({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCheck({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function IconWarning({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 3L2 21h20L12 3z" />
      <path d="M12 10v4M12 17v1" />
    </svg>
  );
}

export function IconInfo({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v1M12 11v5" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAUGE & METRIC ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconGauge({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 21a9 9 0 110-18 9 9 0 010 18z" />
      <path d="M12 12l4-4" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconBudget({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M4 12h16M12 4v16" />
      <path d="M7 8h2M15 8h2M7 16h2M15 16h2" />
    </svg>
  );
}

export function IconToken({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8v8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconActivity({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

export function IconRadio({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M8.5 8.5a5 5 0 017 0M5.5 5.5a9 9 0 0113 0" />
      <path d="M15.5 15.5a5 5 0 01-7 0M18.5 18.5a9 9 0 01-13 0" />
    </svg>
  );
}

export function IconCpu({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="5" y="5" width="14" height="14" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTIONAL ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconChevronUp({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconChevronDown({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED ICONS
// ═══════════════════════════════════════════════════════════════════════════

export function IconWitness({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Eye/witness */}
      <ellipse cx="12" cy="12" rx="9" ry="5" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconVerify({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

export function IconPlan({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 10h18M10 4v16" />
      <circle cx="6.5" cy="7" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="14" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconExecute({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

export function IconReflect({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
      <path d="M8 8a5 5 0 017 7" strokeDasharray="2 2" />
    </svg>
  );
}

export function IconHexagon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" />
    </svg>
  );
}

export function IconGrid({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function IconList({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <rect x="3" y="5" width="2" height="2" fill="currentColor" />
      <rect x="3" y="11" width="2" height="2" fill="currentColor" />
      <rect x="3" y="17" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

export function IconTerminal({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M7 9l3 3-3 3M12 15h5" />
    </svg>
  );
}

export function IconCode({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" />
    </svg>
  );
}

export function IconFile({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function IconFolder({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

export function IconLink({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M10 14a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 10a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function IconCopy({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="9" y="9" width="13" height="13" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

export function IconSearch({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function IconFilter({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

export function IconSort({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M3 6h18M6 12h12M9 18h6" />
    </svg>
  );
}

export function IconMenu({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function IconMore({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconPin({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 2v8l4 4H8l4-4V2z" />
      <path d="M12 22v-8" />
    </svg>
  );
}

export function IconLock({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function IconUnlock({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 017.83-1.17" />
    </svg>
  );
}

export function IconUser({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" />
    </svg>
  );
}

export function IconClock({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function IconCalendar({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <rect x="3" y="4" width="18" height="18" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function IconStar({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function IconHeart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export function IconDownload({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export function IconUpload({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

export function IconExternal({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

export function IconTrash({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconEdit({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconEye({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <path d="M1 1l22 22M14.12 14.12a3 3 0 11-4.24-4.24" />
    </svg>
  );
}

export function IconPersona({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Persona mask / theater mask */}
      <circle cx="12" cy="10" r="7" />
      <path d="M9 9v1M15 9v1" />
      <path d="M9 13c1 1.5 5 1.5 6 0" />
      <path d="M7 17l-1 4M17 17l1 4" />
    </svg>
  );
}

export function IconEvolution({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* DNA / evolution helix */}
      <path d="M4 4c4 0 4 4 8 4s4-4 8-4" />
      <path d="M4 12c4 0 4 4 8 4s4-4 8-4" />
      <path d="M4 20c4 0 4-4 8-4s4 4 8 4" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconContext({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" {...props}>
      {/* Context window / layers */}
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}
