import type { ReflectionData, MemoryDetail } from './types';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aim-chat`;

export async function streamAIMOS({
  conversationHistory, onPlan, onTaskStart, onTaskDelta, onTaskVerifyStart, onTaskVerified,
  onTaskComplete, onTaskError, onReflectionStart, onReflection,
  onKnowledgeUpdate, onRunComplete, onError,
  onTaskRetryStart, onTaskRetryDiagnosis, onProcessEvaluation, onRulesGenerated,
  onThinking, onMemoryDetail, onOpenQuestions,
  onAuditStart, onAuditDecision, onAuditLoopStart,
  onSynthesisStart, onSynthesisComplete,
}: {
  conversationHistory: { role: string; content: string }[];
  onPlan: (data: any) => void;
  onTaskStart: (taskIndex: number, taskId: string, title: string, isAuditTask?: boolean) => void;
  onTaskDelta: (taskIndex: number, delta: string) => void;
  onTaskVerifyStart: (taskIndex: number) => void;
  onTaskVerified: (taskIndex: number, verification: any) => void;
  onTaskComplete: (taskIndex: number, status: string) => void;
  onTaskError: (taskIndex: number, error: string) => void;
  onReflectionStart: () => void;
  onReflection: (data: ReflectionData) => void;
  onKnowledgeUpdate: (data: { nodes_added: number; edges_added: number }) => void;
  onRunComplete: (data: { run_id: string; total_tokens: number; task_count: number }) => void;
  onError: (error: string) => void;
  onTaskRetryStart: (taskIndex: number, reason: string) => void;
  onTaskRetryDiagnosis: (taskIndex: number, diagnosis: string) => void;
  onProcessEvaluation: (data: any) => void;
  onRulesGenerated: (data: any) => void;
  onThinking: (phase: string, content: string) => void;
  onMemoryDetail: (data: MemoryDetail) => void;
  onOpenQuestions: (questions: string[]) => void;
  onAuditStart: () => void;
  onAuditDecision: (data: any) => void;
  onAuditLoopStart: (loop: number, tasks: string[]) => void;
  onSynthesisStart: () => void;
  onSynthesisComplete: (data: any) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages: conversationHistory }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    onError(data.error || `Error ${resp.status}`);
    return;
  }
  if (!resp.body) { onError("No response body"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") return;

      try {
        const evt = JSON.parse(json);
        switch (evt.type) {
          case 'thinking': onThinking(evt.phase, evt.content); break;
          case 'memory_detail': onMemoryDetail(evt); break;
          case 'open_questions': onOpenQuestions(evt.questions); break;
          case 'plan': onPlan(evt); break;
          case 'task_start': onTaskStart(evt.task_index, evt.task_id, evt.title, evt.is_audit_task); break;
          case 'task_delta': onTaskDelta(evt.task_index, evt.delta); break;
          case 'task_verify_start': onTaskVerifyStart(evt.task_index); break;
          case 'task_verified': onTaskVerified(evt.task_index, evt.verification); break;
          case 'task_complete': onTaskComplete(evt.task_index, evt.status); break;
          case 'task_error': onTaskError(evt.task_index, evt.error); break;
          case 'reflection_start': onReflectionStart(); break;
          case 'reflection': onReflection(evt.data); break;
          case 'knowledge_update': onKnowledgeUpdate(evt); break;
          case 'run_complete': onRunComplete(evt); break;
          case 'task_retry_start': onTaskRetryStart(evt.task_index, evt.reason); break;
          case 'task_retry_diagnosis': onTaskRetryDiagnosis(evt.task_index, evt.diagnosis); break;
          case 'process_evaluation': onProcessEvaluation(evt.data); break;
          case 'rules_generated': onRulesGenerated(evt); break;
          case 'audit_start': onAuditStart(); break;
          case 'audit_decision': onAuditDecision(evt); break;
          case 'audit_loop_start': onAuditLoopStart(evt.loop, evt.additional_tasks); break;
          case 'synthesis_start': onSynthesisStart(); break;
          case 'synthesis_complete': onSynthesisComplete(evt); break;
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}
