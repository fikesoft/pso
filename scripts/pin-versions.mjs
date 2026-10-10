import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const folders = [
  '.',
  ...['apps', 'packages'].flatMap((root) => readdirSync(root).map((name) => `${root}/${name}`)),
];
for (const folder of folders) {
  const path = `${folder}/package.json`;
  if (!existsSync(path)) continue;
  const json = JSON.parse(readFileSync(path));
  for (const type of ['dependencies', 'devDependencies'])
    for (const [name, version] of Object.entries(json[type] ?? {})) {
      if (version.startsWith('workspace:')) continue;
      const installed = `${folder}/node_modules/${name}/package.json`;
      if (existsSync(installed)) json[type][name] = JSON.parse(readFileSync(installed)).version;
    }
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}
