import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';
import {
  sourceRoots,
  ignoredDirectories,
  sourceExtensions,
  componentLineLimit,
  moduleLineLimit,
} from './config.constants.mjs';

export function collectFiles(roots = sourceRoots) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (sourceExtensions.has(extname(file)) && !file.endsWith('.d.ts')) files.push(file);
    }
  };
  roots.forEach(visit);
  return files.sort();
}
export function parseSource(file) {
  const text = readFileSync(file, 'utf8');
  const source = file.endsWith('.css')
    ? null
    : ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return { source, text };
}
export function fileLimit(file) {
  return file.endsWith('.tsx') ? componentLineLimit : moduleLineLimit;
}
