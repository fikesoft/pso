import ts from 'typescript';
import { layerRanks, layeredProjects } from './config.constants.mjs';

function boundary(file) {
  const project = layeredProjects.find((root) => file.startsWith(`${root}/`));
  if (!project) return null;
  const path = file.slice(project.length + 1);
  if (path.startsWith('app/')) return { project, layer: 'app', slice: 'app' };
  if (!path.startsWith('src/')) return null;
  const [layer, slice] = path.slice(4).split('/');
  if (!(layer in layerRanks)) return { project, layer: 'app', slice: 'app' }; // Compatibility exports compose lower layers.
  return { project, layer, slice: ['app', 'shared'].includes(layer) ? layer : slice };
}
export function checkDependency(file, target) {
  const source = boundary(file),
    destination = boundary(target);
  if (!source || !destination || source.project !== destination.project) return [];
  const issues = [];
  const sameSlice = source.layer === destination.layer && source.slice === destination.slice;
  if (layerRanks[source.layer] > layerRanks[destination.layer])
    issues.push(`${file}: upward FSD import of ${target}.`);
  else if (source.layer === destination.layer && !sameSlice)
    issues.push(`${file}: sibling slice import of ${target}.`);
  if (!sameSlice && !['app', 'shared'].includes(destination.layer)) {
    const publicApi = `${destination.project}/src/${destination.layer}/${destination.slice}/index.ts`;
    if (target !== publicApi)
      issues.push(`${file}: import ${publicApi} instead of internal ${target}.`);
  }
  return issues;
}
function literalData(node) {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    return literalData(node.expression);
  if (
    ts.isLiteralExpression(node) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind)
  )
    return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(literalData);
  if (ts.isObjectLiteralExpression(node))
    return node.properties.every(
      (property) => ts.isPropertyAssignment(property) && literalData(property.initializer),
    );
  return false;
}
export function checkPlacement(file, source) {
  if (!source) return [];
  const issues = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((entry) => entry.isTypeOnly)
    )
      issues.push(
        `${file}: use a separate import type declaration for consistent frontend/backend style.`,
      );
  }
  if (!file.includes('/src/') || /\.(test|spec)\.[^.]+$/.test(file)) return issues;
  for (const statement of source.statements) {
    if (
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      !/(?:\.types|\/types)\.ts$/.test(file)
    )
      issues.push(
        `${file}: named type ${statement.name.text} belongs in an owned *.types.ts module.`,
      );
    if (
      ts.isVariableStatement(statement) &&
      !/(\.constants\.[^.]+$|\/i18n\/|\/locales\/)/.test(file)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer && literalData(declaration.initializer))
          issues.push(
            `${file}: module data constant ${declaration.name.getText(source)} belongs in an owned *.constants.ts module.`,
          );
      }
    }
  }
  return issues;
}
