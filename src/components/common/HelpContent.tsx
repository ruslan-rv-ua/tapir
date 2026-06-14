/** Injects build-time-sanitized help HTML. No runtime sanitizer needed. */
export function HelpContent({ html }: { html: string }) {
  return (
    <div className="help-content" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
