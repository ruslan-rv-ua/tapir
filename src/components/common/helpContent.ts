// Eager, both-locale payload of tiny sanitized HTML strings (negligible size),
// so content is in the DOM synchronously on first render — best for NVDA.
const modules = import.meta.glob("../../../docs/help/*/*.md", {
  query: "?help",
  import: "default",
  eager: true,
}) as Record<string, string>;

// { locale: { sectionId: html } } — built once at module load.
const byLocale: Record<string, Record<string, string>> = {};
for (const [path, html] of Object.entries(modules)) {
  const match = path.match(/\/help\/([^/]+)\/([^/]+)\.md$/);
  if (!match) continue;
  const [, locale, section] = match;
  (byLocale[locale] ??= {})[section] = html;
}

/** HTML for a help section, falling back to the base locale (uk) then "". */
export function getHelpHtml(locale: string, section: string): string {
  return byLocale[locale]?.[section] ?? byLocale.uk?.[section] ?? "";
}
