import { createTenantServer } from './app/tenant-server';
import { assertVercelApiEnvironment } from './shared/config/vercel-runtime';

assertVercelApiEnvironment(process.env);
const { server } = await createTenantServer();
// Vercel handles listening and WebSocket upgrades for the exported HTTP server.
export default server;
