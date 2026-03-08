import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentSystem, AgentFeedback, AgentConfig, AuditResult } from '@/lib/ai-agents';

export function useAgents() {
  const systemRef = useRef<AgentSystem | null>(null);
  const [feedback, setFeedback] = useState<AgentFeedback[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [running, setRunning] = useState(false);
  const [lastAudit, setLastAudit] = useState<AuditResult | null>(null);

  const getSystem = useCallback(() => {
    if (!systemRef.current) {
      systemRef.current = new AgentSystem((fb) => {
        setFeedback(prev => [...prev.slice(-399), fb]);
        if (fb.type === 'audit' && fb.metadata?.health_score !== undefined) {
          setLastAudit(systemRef.current?.getLastAudit() || null);
        }
      });
      setAgents(systemRef.current.getAgents());
    }
    return systemRef.current;
  }, []);

  useEffect(() => {
    return () => { systemRef.current?.stopAll(); };
  }, []);

  const startAgents = useCallback(async () => {
    const sys = getSystem();
    await sys.startAll();
    setRunning(true);
    setAgents(sys.getAgents());
  }, [getSystem]);

  const stopAgents = useCallback(() => {
    getSystem().stopAll();
    setRunning(false);
  }, [getSystem]);

  const toggleAgent = useCallback((agentId: string) => {
    getSystem().toggleAgent(agentId);
    setAgents(getSystem().getAgents());
  }, [getSystem]);

  const clearFeedback = useCallback(() => {
    getSystem().clearFeedback();
    setFeedback([]);
  }, [getSystem]);

  return { feedback, agents, running, lastAudit, startAgents, stopAgents, toggleAgent, clearFeedback };
}
