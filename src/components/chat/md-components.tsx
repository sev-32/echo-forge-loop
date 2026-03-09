// ─── Markdown Renderer (Hasselblad aesthetic) ───────────
export const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-sm font-bold text-label-primary mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xs font-bold text-label-primary mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-semibold text-label-primary mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="text-xs text-label-secondary mb-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="text-xs text-label-secondary ml-3 mb-1.5 space-y-0.5 list-disc">{children}</ul>,
  ol: ({ children }: any) => <ol className="text-xs text-label-secondary ml-3 mb-1.5 space-y-0.5 list-decimal">{children}</ol>,
  li: ({ children }: any) => <li className="text-xs leading-relaxed text-label-secondary">{children}</li>,
  code: ({ className, children }: any) => {
    const isBlock = className?.includes('language-');
    return isBlock
      ? <pre className="code-block p-2.5 rounded text-[10px] overflow-x-auto my-2"><code>{children}</code></pre>
      : <code className="surface-well px-1 py-0.5 rounded text-[10px] font-mono text-primary">{children}</code>;
  },
  strong: ({ children }: any) => <strong className="font-semibold text-label-primary">{children}</strong>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-label-muted italic">{children}</blockquote>,
  table: ({ children }: any) => <div className="overflow-x-auto my-2"><table className="text-[10px] border-collapse w-full">{children}</table></div>,
  th: ({ children }: any) => <th className="surface-well px-2 py-1 text-left font-medium text-xs text-label-primary">{children}</th>,
  td: ({ children }: any) => <td className="border border-border px-2 py-1 text-xs text-label-secondary">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
};
