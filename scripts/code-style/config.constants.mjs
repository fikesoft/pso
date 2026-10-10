export const sourceRoots = ['apps', 'packages', 'scripts', 'tests'];
export const ignoredDirectories = new Set(['node_modules', '.next', 'generated', 'prisma', 'dist']);
export const sourceExtensions = new Set(['.ts', '.tsx', '.mjs', '.css']);
export const layerRanks = { app: 0, views: 1, widgets: 2, features: 3, entities: 4, shared: 5 };
export const layeredProjects = ['apps/web', 'apps/platform-web', 'apps/api', 'packages/ui'];
export const componentLineLimit = 150;
export const moduleLineLimit = 300;
