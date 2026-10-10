import { isProd } from './config';
import { createTenantServer } from './app/tenant-server';
const bindHost = process.env.API_BIND_HOST ?? '127.0.0.1';
if (!isProd && !['127.0.0.1', '::1'].includes(bindHost))
  throw new Error('Dev permis numai pe loopback');
const { server } = await createTenantServer();
server.listen(4000, bindHost, () => console.log('API tenant: port 4000'));
