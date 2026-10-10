import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';

function resolveFile(candidate) {
  const sourcePath = candidate.replace(/\.js$/, '.ts');
  for (const path of [
    sourcePath,
    ...['.ts', '.tsx', '.mjs', '.css', '/index.ts', '/index.tsx'].map(
      (extension) => sourcePath + extension,
    ),
  ]) {
    if (existsSync(path) && statSync(path).isFile()) return normalize(path);
  }
  return null;
}
function resolveImport(file, specifier) {
  if (specifier.startsWith('.')) return resolveFile(join(dirname(file), specifier));
  if (!specifier.startsWith('@pos/')) return null;
  const [, name, ...subpath] = specifier.split('/');
  const manifestPath = `packages/${name}/package.json`;
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.exports?.[subpath.length ? `./${subpath.join('/')}` : '.'];
  return typeof entry === 'string' ? resolveFile(join(dirname(manifestPath), entry)) : null;
}
export function readImports(file, source) {
  if (!source) return [];
  const dependencies = [];
  const add = (specifier, typeOnly = false) => {
    const target = resolveImport(file, specifier);
    if (target) dependencies.push({ target, typeOnly });
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node;
      const bindings = clause?.namedBindings ?? clause?.exportClause;
      const allTypes =
        bindings &&
        (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((item) => item.isTypeOnly) &&
        !clause?.name;
      add(node.moduleSpecifier.text, Boolean(clause?.isTypeOnly || allTypes));
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return dependencies;
}
export function detectCycles(graph) {
  const complete = new Set(),
    active = new Set(),
    stack = [],
    cycles = [];
  const visit = (file) => {
    if (active.has(file)) {
      cycles.push([...stack.slice(stack.indexOf(file)), file]);
      return;
    }
    if (complete.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const dependency of graph.get(file) ?? []) if (graph.has(dependency)) visit(dependency);
    stack.pop();
    active.delete(file);
    complete.add(file);
  };
  for (const file of graph.keys()) visit(file);
  return cycles;
}
