import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate a UUID v4
export function generateId(): string {
  return crypto.randomUUID();
}

// Generate SHA-256 hash
export async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sync hash for event chaining (simplified for demo)
export function generateHashSync(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// Format timestamp
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

// Format relative time
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return d.toLocaleDateString();
}

// Format duration
export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  
  if (hour > 0) return `${hour}h ${min % 60}m ${sec % 60}s`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

// Format token count
export function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

// Calculate budget percentage
export function getBudgetPercentage(used: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

// Get budget status based on percentage
export function getBudgetStatus(percentage: number): 'ok' | 'warning' | 'critical' | 'exhausted' {
  if (percentage >= 100) return 'exhausted';
  if (percentage >= 90) return 'critical';
  if (percentage >= 75) return 'warning';
  return 'ok';
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Deep clone
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Topological sort for DAG
export function topologicalSort(tasks: { task_id: string; dependencies: string[] }[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const taskMap = new Map(tasks.map(t => [t.task_id, t]));
  
  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    
    const task = taskMap.get(taskId);
    if (task) {
      for (const dep of task.dependencies) {
        visit(dep);
      }
    }
    result.push(taskId);
  }
  
  for (const task of tasks) {
    visit(task.task_id);
  }
  
  return result;
}
