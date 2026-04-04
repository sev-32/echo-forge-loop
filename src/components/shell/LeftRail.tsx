import {
  IconIntelligence,
  IconMission,
  IconSwarm,
  IconHistory,
  IconMemory,
  IconJournal,
  IconCognitive,
  IconKnowledge,
  IconTrust,
  IconPersona,
  IconEvolution,
  IconContext,
  IconSettings,
  IconHexagon,
  IconSearch,
  IconCode,
  IconION,
} from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface RailItem {
  id: string;
  icon: IconComponent;
  label: string;
  shortcut?: string;
  section?: 'primary' | 'secondary';
}

const railItems: RailItem[] = [
  { id: 'chat', icon: IconIntelligence, label: 'Intelligence', shortcut: '1', section: 'primary' },
  { id: 'docs', icon: IconJournal, label: 'Documents', shortcut: '2', section: 'primary' },
  { id: 'ide', icon: IconCode, label: 'IDE', shortcut: '3', section: 'primary' },
  { id: 'ion', icon: IconION, label: 'ION Kernel', shortcut: 'I', section: 'primary' },

  { id: 'missions', icon: IconMission, label: 'Missions', shortcut: '3', section: 'primary' },
  { id: 'swarm', icon: IconSwarm, label: 'Swarm', shortcut: '4', section: 'primary' },
  { id: 'runs', icon: IconHistory, label: 'Run History', shortcut: '4', section: 'secondary' },
  { id: 'memory', icon: IconMemory, label: 'Memory Fabric', shortcut: '5', section: 'secondary' },
  { id: 'journal', icon: IconJournal, label: 'Journal', shortcut: '6', section: 'secondary' },
  { id: 'cognition', icon: IconCognitive, label: 'Cognition', shortcut: '7', section: 'secondary' },
  { id: 'knowledge', icon: IconKnowledge, label: 'Evidence Graph', shortcut: '8', section: 'secondary' },
  { id: 'trust', icon: IconTrust, label: 'Trust & Audit', shortcut: '9', section: 'secondary' },
  { id: 'persona', icon: IconPersona, label: 'Persona', shortcut: '0', section: 'secondary' },
  { id: 'evolution', icon: IconEvolution, label: 'Evolution', section: 'secondary' },
  { id: 'context', icon: IconContext, label: 'Context', section: 'secondary' },
];

interface LeftRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function LeftRail({ activeTab, onTabChange }: LeftRailProps) {
  const primary = railItems.filter(i => i.section === 'primary');
  const secondary = railItems.filter(i => i.section === 'secondary');

  return (
    <nav className="shell-left-rail">
      {/* System Mark */}
      <div className="w-8 h-8 rounded surface-bezel flex items-center justify-center mb-2">
        <IconHexagon className="w-4 h-4 text-primary" />
      </div>

      {/* Primary Nav */}
      <div className="flex flex-col gap-0.5">
        {primary.map((item) => (
          <RailButton key={item.id} item={item} isActive={activeTab === item.id} onClick={() => onTabChange(item.id)} />
        ))}
      </div>

      {/* Divider */}
      <div className="w-6 h-px bg-border my-1.5" />

      {/* Secondary Nav */}
      <div className="flex flex-col gap-0.5">
        {secondary.map((item) => (
          <RailButton key={item.id} item={item} isActive={activeTab === item.id} onClick={() => onTabChange(item.id)} />
        ))}
      </div>

      {/* Bottom - Settings */}
      <div className="mt-auto pt-2 border-t border-border">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button className="rail-icon">
              <IconSettings className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="surface-float border-border text-label-primary text-xs">
            Settings
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

function RailButton({ item, isActive, onClick }: { item: RailItem; isActive: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`rail-icon ${isActive ? 'active' : ''}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="surface-float border-border flex items-center gap-2">
        <span className="text-label-primary text-xs">{item.label}</span>
        {item.shortcut && (
          <kbd className="px-1.5 py-0.5 text-[9px] font-mono surface-well rounded text-label-muted">
            {item.shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}