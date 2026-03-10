import { useState, useCallback, ReactNode } from "react";
import {
    IconRadio, IconIntelligence, IconMemory, IconKnowledge,
    IconCognitive, IconTerminal, IconSettings, IconHistory, IconVision
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// ─── Drawer Definition ──────────────────────────────────────
export interface DrawerDef {
    id: string;
    icon: IconComponent;
    label: string;
    section?: 'primary' | 'secondary';
}

const DRAWERS: DrawerDef[] = [
    { id: 'live-feed', icon: IconRadio, label: 'Live Feed', section: 'primary' },
    { id: 'ai-chat', icon: IconIntelligence, label: 'AI Chat', section: 'primary' },
    { id: 'memory', icon: IconMemory, label: 'Memory', section: 'primary' },
    { id: 'knowledge', icon: IconKnowledge, label: 'Evidence Graph', section: 'primary' },
    { id: 'cognition', icon: IconCognitive, label: 'Cognition', section: 'secondary' },
    { id: 'visual', icon: IconVision, label: 'Visual Inspector', section: 'secondary' },
    { id: 'run-history', icon: IconHistory, label: 'Run History', section: 'secondary' },
    { id: 'terminal', icon: IconTerminal, label: 'Terminal', section: 'secondary' },
];

// ─── Props ──────────────────────────────────────────────────
interface RightDrawerBarProps {
    renderDrawer: (drawerId: string) => ReactNode;
}

export function RightDrawerBar({ renderDrawer }: RightDrawerBarProps) {
    const [activeDrawer, setActiveDrawer] = useState<string | null>('live-feed');

    const toggleDrawer = useCallback((id: string) => {
        setActiveDrawer(prev => prev === id ? null : id);
    }, []);

    const primary = DRAWERS.filter(d => d.section === 'primary');
    const secondary = DRAWERS.filter(d => d.section === 'secondary');

    return (
        <div className="flex h-full">
            {/* Drawer Content Panel */}
            {activeDrawer && (
                <aside
                    className="w-80 border-l border-border flex flex-col overflow-hidden"
                    style={{ background: 'hsl(var(--surface-1))' }}
                >
                    {renderDrawer(activeDrawer)}
                </aside>
            )}

            {/* Right Icon Bar */}
            <nav
                className="w-10 h-full border-l border-border flex flex-col items-center py-2 gap-0.5 flex-shrink-0"
                style={{
                    background: 'hsl(var(--surface-1))',
                    boxShadow: 'inset 1px 0 0 hsl(var(--border-highlight) / 0.1)',
                }}
            >
                {/* Primary drawers */}
                {primary.map(drawer => (
                    <DrawerButton
                        key={drawer.id}
                        drawer={drawer}
                        isActive={activeDrawer === drawer.id}
                        onClick={() => toggleDrawer(drawer.id)}
                    />
                ))}

                {/* Divider */}
                <div className="w-5 h-px my-1.5" style={{ background: 'hsl(var(--border))' }} />

                {/* Secondary drawers */}
                {secondary.map(drawer => (
                    <DrawerButton
                        key={drawer.id}
                        drawer={drawer}
                        isActive={activeDrawer === drawer.id}
                        onClick={() => toggleDrawer(drawer.id)}
                    />
                ))}

                {/* Spacer + Settings at bottom */}
                <div className="mt-auto">
                    <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                            <button className="rail-icon w-7 h-7">
                                <IconSettings className="w-3.5 h-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="surface-float border-border text-label-primary text-xs">
                            Settings
                        </TooltipContent>
                    </Tooltip>
                </div>
            </nav>
        </div>
    );
}

// ─── Drawer Button ──────────────────────────────────────────
function DrawerButton({ drawer, isActive, onClick }: {
    drawer: DrawerDef;
    isActive: boolean;
    onClick: () => void;
}) {
    const Icon = drawer.icon;
    return (
        <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    className={cn(
                        "w-7 h-7 rounded flex items-center justify-center transition-all",
                        isActive
                            ? "rail-icon active"
                            : "rail-icon"
                    )}
                >
                    <Icon className="w-3.5 h-3.5" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="surface-float border-border flex items-center gap-2">
                <span className="text-label-primary text-xs">{drawer.label}</span>
            </TooltipContent>
        </Tooltip>
    );
}
