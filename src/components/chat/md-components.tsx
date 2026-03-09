import { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

// ─── Code Block with Copy ───────────────────────────────
function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const isBlock = className?.includes('language-');
  const language = className?.replace('language-', '') || '';

  const handleCopy = useCallback(() => {
    const text = typeof children === 'string' ? children : String(children);
    navigator.clipboard.writeText(text.replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  if (!isBlock) {
    return <code className="surface-well px-1 py-0.5 rounded text-[10px] font-mono text-primary">{children}</code>;
  }

  return (
    <div className="relative group my-2.5">
      <div className="flex items-center justify-between px-3 py-1 rounded-t bg-secondary/80 border border-b-0 border-border">
        <span className="text-[8px] font-mono text-label-engraved uppercase tracking-wider">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono text-label-muted hover:text-label-primary hover:bg-secondary transition-colors"
          title="Copy code"
        >
          {copied ? <><Check className="h-2.5 w-2.5 text-[hsl(var(--status-success))]" /> Copied</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
        </button>
      </div>
      <pre className="code-block p-3 rounded-b rounded-t-none text-[10px] overflow-x-auto border border-t-0 border-border">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ─── Markdown Renderer (Hasselblad aesthetic) ───────────
export const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-sm font-bold text-label-primary mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xs font-bold text-label-primary mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-semibold text-label-primary mt-2 mb-1">{children}</h3>,
  h4: ({ children }: any) => <h4 className="text-xs font-medium text-label-primary mt-1.5 mb-0.5">{children}</h4>,
  p: ({ children }: any) => <p className="text-xs text-label-secondary mb-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="text-xs text-label-secondary ml-3 mb-1.5 space-y-0.5 list-disc">{children}</ul>,
  ol: ({ children }: any) => <ol className="text-xs text-label-secondary ml-3 mb-1.5 space-y-0.5 list-decimal">{children}</ol>,
  li: ({ children }: any) => <li className="text-xs leading-relaxed text-label-secondary">{children}</li>,
  code: CodeBlock,
  strong: ({ children }: any) => <strong className="font-semibold text-label-primary">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-label-secondary">{children}</em>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-label-muted italic bg-primary/3 py-1 rounded-r">
      {children}
    </blockquote>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2.5 rounded border border-border">
      <table className="text-[10px] border-collapse w-full">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="surface-well">{children}</thead>,
  th: ({ children }: any) => <th className="px-2.5 py-1.5 text-left font-medium text-xs text-label-primary border-b border-border">{children}</th>,
  td: ({ children }: any) => <td className="border-b border-border/50 px-2.5 py-1.5 text-xs text-label-secondary">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">
      {children}
    </a>
  ),
};
