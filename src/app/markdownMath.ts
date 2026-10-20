/** Formules au format `$$…$$`, `\(…\)` ou `\[…\]` ; un simple « 5 $ » n’est pas pris pour une formule. */
export const hasMath = (content: string) => /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(content)

/** Convertit `\(…\)` et `\[…\]` (souvent employés par les modèles) en `$$…$$`, seule notation reconnue. */
export const normalizeMath = (content: string) =>
  content
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, formula: string) => `\n$$\n${formula.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, formula: string) => `$$${formula.trim()}$$`)
