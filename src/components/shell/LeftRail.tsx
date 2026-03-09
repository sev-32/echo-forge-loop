import { 
  MessageSquare, 
  History, 
  Database, 
  Target, 
  Network,
  BookOpen,
  Brain,
  Shield,
  Settings,
  Activity
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RailItem {
  id: string;
  icon: typeof MessageSquare;
  label: string;
  shortcut?: string;
}

const railItems: RailItem[] = [
  { id: 'chat', icon: MessageSquare, label: 'Intelligence', shortcut: '1' },
  { id: 'runs', icon: History, label: 'Run History', shortcut: '2' },
  { id: 'memory', icon: Database, label: 'Memory Fabric', shortcut: '3' },
  { id: 'missions', icon: Target, label: 'Missions', shortcut: '4' },
  { id: 'swarm', icon: Network, label: 'Swarm', shortcut: '5' },
  { id: 'journal', icon: BookOpen, label: 'Journal', shortcut: '6' },
  { id: 'cognition', icon: Brain, label: 'Cognition', shortcut: '7' },
  { id: 'knowledge', icon: Activity, label: 'Evidence Graph', shortcut: '8' },
  { id: 'trust', icon: Shield, label: 'Trust & Audit', shortcut: '9' },
];

interface LeftRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function LeftRail({ activeTab, onTabChange }: LeftRailProps) {
  return (
    <nav className="shell-left-rail">
      {/* Main Navigation */}
      <div className="flex-1 flex flex-col gap-1">
        {railItems.map((item) => (
          <Tooltip key={item.id} delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onTabChange(item.id)}
                className={`rail-icon ${activeTab === item.id ? 'active' : ''}`}
              >
                <item.icon className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              <span>{item.label}</span>
              {item.shortcut && (
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-2 rounded border border-border">
                  {item.shortcut}
                </kbd>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Bottom - Settings */}
      <div className="mt-auto pt-2 border-t border-border">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button className="rail-icon">
              <Settings className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
