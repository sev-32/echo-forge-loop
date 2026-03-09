import { SVGProps } from 'react';

type StepType = 'memory' | 'plan' | 'execute' | 'verify' | 'retry' | 'audit' | 'synthesize' | 'reflect' | 'evolve';

interface PipelineStepIconProps extends SVGProps<SVGSVGElement> {
  step: StepType;
  size?: number;
}

export function PipelineStepIcon({ step, size = 16, ...props }: PipelineStepIconProps) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      {stepPaths[step]}
    </svg>
  );
}

const stepPaths: Record<StepType, JSX.Element> = {
  memory: (
    // Layered memory crystal
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" opacity="0.3" fill="currentColor" />
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
      <path d="M4 7l8 5 8-5" />
      <path d="M12 12v10" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.6" />
    </g>
  ),
  plan: (
    // Constellation/node planner
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="5" cy="12" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="19" cy="12" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="8" cy="20" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="20" r="2" fill="currentColor" opacity="0.4" />
      <line x1="12" y1="6" x2="5" y2="10" />
      <line x1="12" y1="6" x2="19" y2="10" />
      <line x1="5" y1="14" x2="8" y2="18" />
      <line x1="19" y1="14" x2="16" y2="18" />
      <line x1="8" y1="20" x2="16" y2="20" opacity="0.5" />
    </g>
  ),
  execute: (
    // Lightning bolt execution
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" opacity="0.15" />
    </g>
  ),
  verify: (
    // Shield with checkmark
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M12 2l8 4v6c0 5.25-3.5 8.75-8 10-4.5-1.25-8-4.75-8-10V6l8-4z" />
      <path d="M12 2l8 4v6c0 5.25-3.5 8.75-8 10-4.5-1.25-8-4.75-8-10V6l8-4z" fill="currentColor" opacity="0.1" />
      <path d="M9 12l2 2 4-4" strokeWidth="2" />
    </g>
  ),
  retry: (
    // Orbital retry loop
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M3 12a9 9 0 0 1 15-6.7" />
      <path d="M21 12a9 9 0 0 1-15 6.7" />
      <polyline points="18 2 18 6 14 6" fill="none" />
      <polyline points="6 22 6 18 10 18" fill="none" />
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.2" />
    </g>
  ),
  audit: (
    // Scanning eye
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <line x1="12" y1="2" x2="12" y2="5" opacity="0.4" />
      <line x1="12" y1="19" x2="12" y2="22" opacity="0.4" />
    </g>
  ),
  synthesize: (
    // Diamond prism synthesis
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M12 2L2 9l10 13L22 9L12 2z" />
      <path d="M12 2L2 9l10 13L22 9L12 2z" fill="currentColor" opacity="0.1" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <line x1="8" y1="9" x2="12" y2="22" />
      <line x1="16" y1="9" x2="12" y2="22" />
      <line x1="8" y1="2.5" x2="8" y2="9" opacity="0.4" />
      <line x1="16" y1="2.5" x2="16" y2="9" opacity="0.4" />
    </g>
  ),
  reflect: (
    // Infinity mirror / möbius
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M12 6C8 6 4.5 8.5 4.5 12S8 18 12 18s7.5-2.5 7.5-6S16 6 12 6z" fill="currentColor" opacity="0.08" />
      <path d="M18.5 8c1 1.2 1.5 2.5 1.5 4 0 3.5-3.5 6-8 6s-8-2.5-8-6 3.5-6 8-6c2 0 3.8.6 5.2 1.5" />
      <path d="M5.5 16c-1-1.2-1.5-2.5-1.5-4 0-3.5 3.5-6 8-6s8 2.5 8 6-3.5 6-8 6c-2 0-3.8-.6-5.2-1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
    </g>
  ),
  evolve: (
    // DNA helix evolution
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M8 2c0 4 8 4 8 8s-8 4-8 8" />
      <path d="M16 2c0 4-8 4-8 8s8 4 8 8" />
      <line x1="8" y1="6" x2="16" y2="6" opacity="0.4" />
      <line x1="9" y1="12" x2="15" y2="12" opacity="0.4" />
      <line x1="8" y1="18" x2="16" y2="18" opacity="0.4" />
      <circle cx="12" cy="2" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="12" cy="22" r="1" fill="currentColor" opacity="0.4" />
    </g>
  ),
};
