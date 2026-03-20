// ─── Document Builder Types ──────────────────────────────────
export type DocBlockType = 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'divider' | 'image' | 'table' | 'callout' | 'canvas';

export type WritingStyle = 'academic' | 'technical' | 'casual' | 'legal' | 'creative' | 'journalistic' | 'executive';

export type DocStatus = 'draft' | 'in_progress' | 'review' | 'final' | 'archived';

export interface DocBlock {
  id: string;
  type: DocBlockType;
  content: string;
  metadata?: Record<string, unknown>;
  order: number;
  indent?: number;
  style?: Partial<BlockStyle>;
}

export interface BlockStyle {
  alignment: 'left' | 'center' | 'right' | 'justify';
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color?: string;
  background?: string;
}

export interface DocumentMeta {
  id: string;
  title: string;
  status: DocStatus;
  style: WritingStyle;
  created_at: string;
  updated_at: string;
  word_count: number;
  tags: string[];
  outline?: string[];
  mission_id?: string;
}

export interface AIWritingAction {
  type: 'expand' | 'condense' | 'rephrase' | 'formalize' | 'simplify' | 'continue' | 'outline' | 'critique' | 'generate_section';
  label: string;
  icon: string;
  description: string;
}

export const AI_WRITING_ACTIONS: AIWritingAction[] = [
  { type: 'expand', label: 'Expand', icon: '↔', description: 'Elaborate with more detail and depth' },
  { type: 'condense', label: 'Condense', icon: '⊕', description: 'Compress to essential points' },
  { type: 'rephrase', label: 'Rephrase', icon: '↻', description: 'Rewrite with different wording' },
  { type: 'formalize', label: 'Formalize', icon: '◆', description: 'Elevate to formal register' },
  { type: 'simplify', label: 'Simplify', icon: '◇', description: 'Make accessible and clear' },
  { type: 'continue', label: 'Continue', icon: '→', description: 'Generate next logical section' },
  { type: 'outline', label: 'Outline', icon: '≡', description: 'Generate document structure' },
  { type: 'critique', label: 'Critique', icon: '⚡', description: 'Analyze for gaps and improvements' },
  { type: 'generate_section', label: 'Generate', icon: '✦', description: 'AI writes a full section from brief' },
];

export interface DocMission {
  id: string;
  goal: string;
  style: WritingStyle;
  sections: DocMissionSection[];
  status: 'planning' | 'generating' | 'reviewing' | 'complete';
  progress: number;
}

export interface DocMissionSection {
  title: string;
  brief: string;
  status: 'queued' | 'generating' | 'done' | 'failed';
  content?: string;
  word_target?: number;
}
