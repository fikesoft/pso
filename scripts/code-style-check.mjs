import { collectFiles, parseSource, fileLimit } from './code-style/files.mjs';
import { readImports, detectCycles } from './code-style/imports.mjs';
import { checkPlacement, checkDependency } from './code-style/rules.mjs';

const files = collectFiles();
const issues = [];
const graph = new Map();
for (const file of files) {
  const { source, text } = parseSource(file);
  const lines = text.trimEnd().split(/\r?\n/).length;
  if (lines > fileLimit(file)) issues.push(`${file}: ${lines} lines exceeds ${fileLimit(file)}.`);
  issues.push(...checkPlacement(file, source));
  const imports = readImports(file, source);
  for (const dependency of imports) issues.push(...checkDependency(file, dependency.target));
  graph.set(
    file,
    imports.filter((item) => !item.typeOnly).map((item) => item.target),
  );
}
for (const cycle of detectCycles(graph)) issues.push(`Import cycle: ${cycle.join(' -> ')}`);
if (issues.length) {
  console.error(issues.join('\n'));
  console.error(`Code style failed: ${issues.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Code style passed: ${files.length} files; TSX ≤150 lines, TS/MJS/CSS ≤300, owned types/constants, FSD dependencies, public APIs and no runtime cycles.`,
  );
}
