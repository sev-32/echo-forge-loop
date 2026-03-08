// ============================================
// Memory Panel — CMC Bitemporal Atom Browser
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { cmc, type Atom, type MemorySnapshot, type AtomType } from '@/lib/cmc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Database, RefreshCw, Clock, Layers, Hash, FileText, Code, Lightbulb,
  ShieldCheck, Wrench, Search, Camera
} from 'lucide-react';

const ATOM_TYPE_ICONS: Record<AtomType, typeof FileText> = {
  text: FileText, code: Code, decision: Lightbulb, reflection: Lightbulb,
  plan: Layers, verification: ShieldCheck, discovery: Search,
  constraint: ShieldCheck, artifact: Wrench,
};

const ATOM_TYPE_COLORS: Record<AtomType, string> = {
  text: 'bg-blue-500/20 text-blue-400',
  code: 'bg-emerald-500/20 text-emerald-400',
  decision: 'bg-amber-500/20 text-amber-400',
  reflection: 'bg-purple-500/20 text-purple-400',
  plan: 'bg-cyan-500/20 text-cyan-400',
  verification: 'bg-green-500/20 text-green-400',
  discovery: 'bg-pink-500/20 text-pink-400',
  constraint: 'bg-red-500/20 text-red-400',
  artifact: 'bg-orange-500/20 text-orange-400',
};

export function MemoryPanel() {
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [snapshots, setSnapshots] = useState<MemorySnapshot[]>([]);
  const [selectedAtom, setSelectedAtom] = useState<Atom | null>(null);
  const [stats, setStats] = useState<{ totalAtoms: number; atomsByType: Record<string, number>; totalSnapshots: number; totalTokens: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [atomsData, snapshotsData, statsData] = await Promise.all([
      cmc.getRecentAtoms(100),
      cmc.getSnapshots(),
      cmc.getStats(),
    ]);
    setAtoms(atomsData);
    setSnapshots(snapshotsData);
    setStats(statsData);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filteredAtoms = filterType === 'all' ? atoms : atoms.filter(a => a.atom_type === filterType);

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left: Atom list */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Stats bar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold gradient-text">CMC — Memory</span>
          </div>
          <div className="flex-1" />
          {stats && (
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span>{stats.totalAtoms} atoms</span>
              <span>·</span>
              <span>{stats.totalSnapshots} snapshots</span>
              <span>·</span>
              <span>{(stats.totalTokens / 1000).toFixed(1)}k tokens</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refresh}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Type filter */}
        <div className="flex gap-1 flex-wrap">
          <Badge
            variant={filterType === 'all' ? 'default' : 'outline'}
            className="cursor-pointer text-[9px] px-1.5 py-0"
            onClick={() => setFilterType('all')}
          >All</Badge>
          {Object.keys(ATOM_TYPE_COLORS).map(type => (
            <Badge
              key={type}
              variant={filterType === type ? 'default' : 'outline'}
              className="cursor-pointer text-[9px] px-1.5 py-0"
              onClick={() => setFilterType(type)}
            >{type}</Badge>
          ))}
        </div>

        {/* Atom list */}
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {filteredAtoms.map(atom => {
              const Icon = ATOM_TYPE_ICONS[atom.atom_type] || FileText;
              return (
                <button
                  key={atom.id}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    selectedAtom?.id === atom.id
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/50 hover:border-border bg-card/50'
                  }`}
                  onClick={() => setSelectedAtom(atom)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`p-0.5 rounded ${ATOM_TYPE_COLORS[atom.atom_type]}`}>
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <span className="text-[10px] font-medium truncate flex-1">
                      {atom.content.slice(0, 80)}{atom.content.length > 80 ? '…' : ''}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(atom.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {atom.content_hash.slice(0, 8)}
                    </span>
                    {atom.provenance?.confidence != null && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3">
                        {(atom.provenance.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                    <span className="text-[9px] text-muted-foreground">
                      ~{atom.tokens_estimate}tok
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredAtoms.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-8">
                {loading ? 'Loading atoms…' : 'No atoms yet. Run a goal to create memory atoms.'}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Detail / Snapshots */}
      <div className="w-72 flex flex-col gap-2">
        {selectedAtom ? (
          <Card className="flex-1 overflow-hidden">
            <CardHeader className="p-2 pb-1">
              <CardTitle className="text-[11px] flex items-center gap-1">
                <Hash className="h-3 w-3" /> Atom Detail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ScrollArea className="h-[calc(100%-2rem)]">
                <div className="space-y-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Type:</span>{' '}
                    <Badge className={`${ATOM_TYPE_COLORS[selectedAtom.atom_type]} text-[9px] px-1 py-0`}>
                      {selectedAtom.atom_type}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hash:</span>{' '}
                    <code className="text-[9px] font-mono">{selectedAtom.content_hash.slice(0, 16)}…</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transaction Time:</span>{' '}
                    {new Date(selectedAtom.transaction_time).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valid From:</span>{' '}
                    {new Date(selectedAtom.valid_time_start).toLocaleString()}
                  </div>
                  {selectedAtom.valid_time_end && (
                    <div>
                      <span className="text-muted-foreground">Valid Until:</span>{' '}
                      {new Date(selectedAtom.valid_time_end).toLocaleString()}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Provenance:</span>
                    <pre className="mt-0.5 p-1 rounded bg-muted/50 text-[9px] font-mono whitespace-pre-wrap">
                      {JSON.stringify(selectedAtom.provenance, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Content:</span>
                    <pre className="mt-0.5 p-1 rounded bg-muted/50 text-[9px] font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                      {selectedAtom.content}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <span className="text-muted-foreground text-xs">Select an atom to view details</span>
          </Card>
        )}

        {/* Snapshots */}
        <Card>
          <CardHeader className="p-2 pb-1">
            <CardTitle className="text-[11px] flex items-center gap-1">
              <Camera className="h-3 w-3" /> Snapshots ({snapshots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {snapshots.slice(0, 10).map(snap => (
                  <div key={snap.id} className="flex items-center gap-1.5 text-[9px]">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="font-mono">{snap.snapshot_hash.slice(0, 8)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{snap.atom_count} atoms</span>
                    <span className="text-muted-foreground flex-1 text-right">
                      {snap.reason}
                    </span>
                  </div>
                ))}
                {snapshots.length === 0 && (
                  <span className="text-muted-foreground text-[9px]">No snapshots yet</span>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
