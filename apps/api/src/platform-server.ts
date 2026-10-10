import { isProd } from './config';
import { platformDb } from './db';
import { createApp } from './server';
const role = await platformDb.$queryRaw<
  Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
>`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
if (role[0]?.rolname !== 'pos_platform' || role[0].rolsuper || role[0].rolbypassrls)
  throw new Error('Control plane DB necesită rolul restrâns pos_platform');
const bindHost = process.env.PLATFORM_BIND_HOST ?? '127.0.0.1';
if (!isProd && !['127.0.0.1', '::1'].includes(bindHost))
  throw new Error('Dev permis numai pe loopback');
createApp('PLATFORM').listen(4001, bindHost, () => console.log('API platformă privată: port 4001'));
