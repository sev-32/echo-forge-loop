import { useEffect, useState, useCallback } from "react";
import {
  CommandDialog, CommandInput, CommandList,
  CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";
import {
  IconIntelligence, IconMission, IconSwarm, IconHistory,
  IconMemory, IconJournal, IconCognitive, IconKnowledge,
  IconTrust, IconSettings, IconSearch,
} from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface CommandPaletteProps {
  onNavigate: (tab: string) => void;
}

const surfaces: { id: string; label: string; icon: IconComponent; shortcut: string; section: string }[] = [
  { id: 'chat', label: 'AIM Chat', icon: IconIntelligence, shortcut: '1', section: 'Navigation' },
  { id: 'missions', label: 'Missions', icon: IconMission, shortcut: '2', section: 'Navigation' },
  { id: 'swarm', label: 'Swarm', icon: IconSwarm, shortcut: '3', section: 'Navigation' },
  { id: 'runs', label: 'Run History', icon: IconHistory, shortcut: '4', section: 'Navigation' },
  { id: 'memory', label: 'Memory Fabric', icon: IconMemory, shortcut: '5', section: 'Navigation' },
  { id: 'journal', label: 'Journal', icon: IconJournal, shortcut: '6', section: 'Navigation' },
  { id: 'cognition', label: 'Cognition', icon: IconCognitive, shortcut: '7', section: 'Navigation' },
  { id: 'knowledge', label: 'Knowledge Graph', icon: IconKnowledge, shortcut: '8', section: 'Navigation' },
  { id: 'trust', label: 'Trust Layer', icon: IconTrust, shortcut: '9', section: 'Navigation' },
];

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = useCallback((id: string) => {
    onNavigate(id);
    setOpen(false);
  }, [onNavigate]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search surfaces, commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {surfaces.map(s => {
            const Icon = s.icon;
            return (
              <CommandItem
                key={s.id}
                value={s.label}
                onSelect={() => handleSelect(s.id)}
                className="gap-2"
              >
                <Icon size={16} className="text-primary" />
                <span>{s.label}</span>
                <CommandShortcut>{s.shortcut}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
