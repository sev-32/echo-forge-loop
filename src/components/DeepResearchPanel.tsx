// ─── Deep Research Panel ─────────────────────────────
// Interactive research UI with phase visualization

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import { mdComponents } from '@/components/chat/md-components';
import {
  Search, Loader2, Brain, Layers, GitCompare, FileText, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronRight, Sparkles, Target, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { GaugeRadial } from '@/components/ui/instruments';
import {
  streamDeepResearch,
  type ResearchDecomposition,
  type ResearchFinding,
  type CrossReference,
  type ResearchResult,
} from '@/lib/deep-research';

const PHASE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  decompose: { icon: Layers, label: 'DECOMPOSE', color: 'text-status-info' },
  research: { icon: Search, label: 'RESEARCH', color: 'text-primary' },
  cross_reference: { icon: GitCompare, label: 'CROSS-REF', color: 'text-status-warning' },
  synthesize: { icon: FileText, label: 'SYNTHESIZE', color: 'text-status-success' },
  persist: { icon: Brain, label: 'PERSIST', color: 'text-primary' },
  complete: { icon: CheckCircle2, label: 'COMPLETE', color: 'text-status-success' },
};

const ANGLE_COLORS: Record<string, string> = {
  technical: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  historical: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  comparative: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  practical: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  theoretical: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'evidence-based': 'bg-green-500/15 text-green-400 border-green-500/20',
  'counter-argument': 'bg-red-500/15 text-red-400 border-red-500/20',
};

export function DeepResearchPanel() {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'standard' | 'deep'>('standard');
  const [status, setStatus] = useState<ResearchResult['status']>('idle');
  const [activePhase, setActivePhase] = useState('');
  const [phaseMessage, setPhaseMessage] = useState('');
  const [decomposition, setDecomposition] = useState<ResearchDecomposition | null>(null);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [activeSubs, setActiveSubs] = useState<Set<number>>(new Set());
  const [crossRef, setCrossRef] = useState<CrossReference | null>(null);
  const [report, setReport] = useState('');
  const [meta, setMeta] = useState<ResearchResult['meta']>();
  const [error, setError] = useState('');
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [findings, crossRef, report, activePhase]);

  const executeResearch = useCallback(async () => {
    if (!query.trim() || status === 'decomposing' || status === 'researching') return;

    setStatus('decomposing');
    setDecomposition(null);
    setFindings([]);
    setActiveSubs(new Set());
    setCrossRef(null);
    setReport('');
    setMeta(undefined);
    setError('');
    setExpandedFinding(null);
    setShowReport(false);

    await streamDeepResearch({
      query: query.trim(),
      depth,
      onPhase: (phase, message) => {
        setActivePhase(phase);
        setPhaseMessage(message);
        if (phase === 'research') setStatus('researching');
        else if (phase === 'cross_reference') setStatus('cross_referencing');
        else if (phase === 'synthesize') setStatus('synthesizing');
        else if (phase === 'persist') setStatus('persisting');
      },
      onDecomposition: (data) => setDecomposition(data),
      onSubResearchStart: (idx) => setActiveSubs(prev => new Set(prev).add(idx)),
      onSubResearchComplete: (idx, finding) => {
        setFindings(prev => { const next = [...prev]; next[idx] = finding; return next; });
        setActiveSubs(prev => { const next = new Set(prev); next.delete(idx); return next; });
      },
      onCrossReference: (data) => setCrossRef(data),
      onReport: (content) => { setReport(content); setShowReport(true); },
      onComplete: (m) => { setMeta(m as any); setStatus('complete'); },
      onError: (err) => { setError(err); setStatus('error'); },
    });
  }, [query, depth, status]);

  const isRunning = !['idle', 'complete', 'error'].includes(status);
  const phases = ['decompose', 'research', 'cross_reference', 'synthesize', 'persist', 'complete'];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="panel-header border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-primary" />
          <span className="text-engraved">DEEP RESEARCH ENGINE</span>
          {status === 'complete' && meta && (
            <Badge className="bg-status-success/15 text-status-success border-status-success/20 text-[8px] px-1.5 h-4">
              {meta.findings_count} findings · {((meta.overall_confidence || 0) * 100).toFixed(0)}% confidence
            </Badge>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-3 border-b border-border">
        <div className="flex gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); executeResearch(); } }}
            placeholder="Enter a research question... (e.g., 'Compare WebAssembly vs JavaScript for real-time audio processing')"
            className="flex-1 resize-none h-16 rounded surface-well px-3 py-2 text-xs text-label-primary placeholder:text-label-muted focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            disabled={isRunning}
          />
          <div className="flex flex-col gap-1.5">
            <Button
              onClick={executeResearch}
              disabled={!query.trim() || isRunning}
              size="sm"
              className="h-8 text-[10px] font-mono"
            >
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
              {isRunning ? 'RESEARCHING' : 'RESEARCH'}
            </Button>
            <button
              onClick={() => setDepth(d => d === 'standard' ? 'deep' : 'standard')}
              disabled={isRunning}
              className={`text-[9px] font-mono px-2 py-1 rounded transition-colors ${
                depth === 'deep' ? 'surface-well text-primary amber-glow' : 'surface-well text-label-muted hover:text-label-secondary'
              }`}
            >
              {depth === 'deep' ? '🔬 DEEP' : '⚡ STANDARD'}
            </button>
          </div>
        </div>
      </div>

      {/* Phase Pipeline */}
      {status !== 'idle' && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
          {phases.map((phase, i) => {
            const cfg = PHASE_CONFIG[phase];
            const Icon = cfg.icon;
            const isActive = activePhase === phase;
            const isPast = phases.indexOf(activePhase) > i || status === 'complete';
            return (
              <div key={phase} className="flex items-center gap-1">
                {i > 0 && <div className={`w-4 h-px ${isPast ? 'bg-primary' : 'bg-border'}`} />}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono transition-all ${
                  isActive ? 'surface-well amber-glow' : isPast ? 'text-label-secondary' : 'text-label-engraved'
                }`}>
                  <Icon className={`h-2.5 w-2.5 ${isActive ? cfg.color : isPast ? 'text-status-success' : 'text-label-engraved'}`} />
                  {cfg.label}
                </div>
              </div>
            );
          })}
          {isRunning && <span className="text-[9px] text-label-muted font-mono ml-2">{phaseMessage}</span>}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {/* Idle state */}
          {status === 'idle' && !report && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-label-engraved mx-auto mb-3" />
              <h3 className="text-sm font-mono font-bold text-label-primary mb-1">DEEP RESEARCH</h3>
              <p className="text-[10px] text-label-muted max-w-md mx-auto leading-relaxed">
                Multi-step AI research: decomposes your question into sub-queries, 
                researches each angle in parallel, cross-references findings, 
                and synthesizes a comprehensive report with confidence scores.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                {['🔬 Technical Deep-Dives', '⚖️ Comparative Analysis', '📊 Evidence Synthesis'].map((tag) => (
                  <span key={tag} className="text-[9px] px-2 py-1 surface-well rounded font-mono text-label-muted">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Decomposition */}
          {decomposition && (
            <div className="surface-well rounded p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="h-3 w-3 text-status-info" />
                <span className="text-[10px] font-mono font-bold text-label-primary">RESEARCH DECOMPOSITION</span>
              </div>
              <p className="text-[10px] text-label-secondary mb-2"><strong className="text-label-primary">Thesis:</strong> {decomposition.main_thesis}</p>
              <p className="text-[9px] text-label-muted mb-2"><strong>Scope:</strong> {decomposition.research_scope}</p>
              <div className="flex gap-1 flex-wrap mb-2">
                {decomposition.key_domains?.map((d, i) => (
                  <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{d}</span>
                ))}
              </div>
              <div className="space-y-1">
                {decomposition.sub_questions?.map((sq, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="text-label-engraved font-mono w-4">{i + 1}.</span>
                    {activeSubs.has(i) && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />}
                    {findings[i] && <CheckCircle2 className="h-2.5 w-2.5 text-status-success" />}
                    <span className="text-label-secondary flex-1">{sq.question}</span>
                    <Badge className={`${ANGLE_COLORS[sq.angle] || 'bg-secondary text-label-muted'} text-[7px] px-1 py-0 h-3 border`}>
                      {sq.angle}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          {findings.filter(Boolean).length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-mono font-bold text-label-primary">FINDINGS ({findings.filter(Boolean).length})</span>
              </div>
              {findings.map((f, i) => f ? (
                <div key={i} className="surface-well rounded overflow-hidden">
                  <button
                    className="w-full text-left p-2 flex items-center gap-2 hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedFinding(expandedFinding === i ? null : i)}
                  >
                    {expandedFinding === i ? <ChevronDown className="h-2.5 w-2.5 text-label-muted" /> : <ChevronRight className="h-2.5 w-2.5 text-label-muted" />}
                    <Badge className={`${ANGLE_COLORS[f.angle] || ''} text-[7px] px-1 py-0 h-3 border`}>{f.angle}</Badge>
                    <span className="text-[10px] text-label-secondary flex-1 truncate">{f.summary}</span>
                    <GaugeRadial value={f.confidence * 100} size={20} strokeWidth={2} showTicks={false} />
                  </button>
                  {expandedFinding === i && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border/50">
                      <p className="text-[10px] text-label-secondary leading-relaxed mt-2">{f.detailed_analysis}</p>
                      {f.key_facts?.length > 0 && (
                        <div>
                          <span className="text-[8px] font-mono text-label-muted uppercase">Key Facts:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {f.key_facts.map((fact, fi) => (
                              <li key={fi} className="text-[9px] text-label-secondary flex items-start gap-1">
                                <Zap className="h-2 w-2 text-primary mt-0.5 shrink-0" />{fact}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {f.uncertainties && f.uncertainties.length > 0 && (
                        <div>
                          <span className="text-[8px] font-mono text-status-warning uppercase">Uncertainties:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {f.uncertainties.map((u, ui) => (
                              <li key={ui} className="text-[9px] text-label-muted flex items-start gap-1">
                                <AlertTriangle className="h-2 w-2 text-status-warning mt-0.5 shrink-0" />{u}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null)}
            </div>
          )}

          {/* Cross-reference */}
          {crossRef && (
            <div className="surface-well rounded p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <GitCompare className="h-3 w-3 text-status-warning" />
                <span className="text-[10px] font-mono font-bold text-label-primary">CROSS-REFERENCE ANALYSIS</span>
                <GaugeRadial value={(crossRef.overall_confidence || 0) * 100} size={24} strokeWidth={2} showTicks={false} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div>
                  <span className="text-[8px] font-mono text-status-success uppercase">Agreements ({crossRef.agreements?.length || 0})</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {crossRef.agreements?.slice(0, 4).map((a, i) => (
                      <li key={i} className="text-label-secondary">✓ {a}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[8px] font-mono text-status-error uppercase">Contradictions ({crossRef.contradictions?.length || 0})</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {crossRef.contradictions?.slice(0, 3).map((c, i) => (
                      <li key={i} className="text-label-secondary">⚡ {c.claim_a} vs {c.claim_b}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {crossRef.emergent_insights && crossRef.emergent_insights.length > 0 && (
                <div className="mt-2">
                  <span className="text-[8px] font-mono text-primary uppercase">Emergent Insights</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {crossRef.emergent_insights.map((ins, i) => (
                      <li key={i} className="text-[9px] text-label-secondary">💡 {ins}</li>
                    ))}
                  </ul>
                </div>
              )}
              {crossRef.gaps && crossRef.gaps.length > 0 && (
                <div className="mt-2">
                  <span className="text-[8px] font-mono text-status-warning uppercase">Knowledge Gaps</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {crossRef.gaps.map((g, i) => (
                      <li key={i} className="text-[9px] text-label-muted">⚠ {g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Report */}
          {report && showReport && (
            <div className="surface-well rounded p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles className="h-3 w-3 text-status-success" />
                <span className="text-[10px] font-mono font-bold text-label-primary">RESEARCH REPORT</span>
              </div>
              <div className="prose-research">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {report}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="surface-well rounded p-3 border border-status-error/30">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-status-error" />
                <span className="text-[10px] text-status-error font-mono">{error}</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
