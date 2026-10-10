import { stdin, stdout } from 'node:process';
import { hashPassword } from './crypto';
import { platformDb } from './db';
const login = (process.env.POS_BOOTSTRAP_LOGIN ?? 'owner').normalize('NFKC').trim().toLowerCase();
if (await platformDb.platformAdmin.findUnique({ where: { loginNormalized: login } }))
  throw new Error('Contul există deja. Bootstrapul nu resetează parole.');
let password = process.env.POS_BOOTSTRAP_PASSWORD;
if (!password) {
  if (!stdin.isTTY)
    throw new Error(
      'Furnizați POS_BOOTSTRAP_PASSWORD temporar printr-un canal local sigur sau folosiți un terminal interactiv.',
    );
  stdout.write('Parola inițială (minim 12 caractere, intrare ascunsă): ');
  stdin.setRawMode(true);
  password = await new Promise<string>((resolve, reject) => {
    let value = '';
    const onData = (data: Buffer) => {
      for (const char of data.toString()) {
        if (char === '\u0003') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          reject(new Error('Anulat'));
          return;
        }
        if (char === '\r' || char === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}
if (password.length < 12 || password.length > 128)
  throw new Error('Parola trebuie să aibă între 12 și 128 caractere.');
await platformDb.platformAdmin.create({
  data: {
    loginNormalized: login,
    displayName: 'Administrator platformă',
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    mfaRequired: true,
  },
});
console.log(
  'Contul platformei a fost creat. Schimbarea parolei și MFA sunt obligatorii la prima autentificare.',
);
await platformDb.$disconnect();
