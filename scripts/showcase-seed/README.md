# Seed complet pentru două companii

`companie-plina` primește trei locații, 24 lucrători cu roluri diferite, 42 produse Nori/DEMO cu rețete și stocuri, 36 clienți sintetici, 72 adrese, 24 mese, trei case, șase stații de bucătărie, 15 ture de pontaj și 156 comenzi. Comenzile acoperă prepararea, ambalarea, livrarea, plățile numerar/card/mixte, bonurile DEMO, retururile și anulările. `companie-goala` primește numai administratorul principal.

Meniul reutilizează eșantionul Nori existent: 13 produse de referință și un set inventat. Alte 28 produse, prețurile de exercițiu și rețetele sunt sintetice. Nu reprezintă meniul sau rețetele oficiale actuale. Clienții și lucrătorii sunt inventați; datele companiilor existente nu sunt copiate.

## Rulare

După instalarea dependențelor și pregătirea schemei DB:

```sh
# Producție: configurațiile private existente, roluri restrânse și Neon direct cu verify-full
scripts/pnpm seed:showcase:production

# Opțional, numai pentru dezvoltare locală pos_dev
scripts/pnpm seed:showcase
```

Varianta de producție citește `.local/vercel-db.env`, apoi `.local/vercel-production.env`. Toate rolurile (`pos_runtime`, `pos_auth`, `pos_platform`) trebuie să indice aceeași bază. Sunt necesare `NODE_ENV=production`, `TENANT_ORIGIN` HTTPS, cheia tenantului `MFA_ENCRYPTION_KEY` și `CSRF_SECRET`. Rolul platformei rămâne în procesul privat. Seedul folosește temporar API-ul tenant pe loopback, cu autentificare, autorizare, CSRF/Origin și idempotență reale.

Seedul se rulează separat de build; Vercel/CI sunt refuzate. Loginurile sunt `/c/companie-plina/login` și `/c/companie-goala/login`. Administratorii au login `admin`, parolă temporară individuală și MFA obligatoriu. Lucrătorii operaționali au PIN-uri distincte și acces limitat la locația lor; managerii folosesc parolă și MFA.

Credențialele sunt salvate numai în `.local/showcase-production-accounts.json` sau `.local/showcase-local-accounts.json`, cu permisiuni 0600. `companies[].admin.password` este parola temporară, `users[].secret` este PIN-ul/parola conform profilului, iar `platform.password` aparține contului privat `showcase-owner`. Parolele temporare expiră după 168 ore; secretele nu sunt afișate în terminal.

## Recuperare

Manifestul `.json.pending` este scris înaintea modificărilor DB și redenumit atomic după verificare. Păstrați-l după o întrerupere: rerularea folosește aceleași credențiale și chei, fără duplicate sau resetări. După succes, rerularea doar verifică datele seedului și păstrează modificările operatorilor. Datele create ulterior în compania goală rămân intacte.

Un lock `.local/showcase-production.lock` sau `.local/showcase-local.lock` împiedică două execuții simultane. Îndepărtați numai lockul unui proces întrerupt, după verificarea că procesul nu mai rulează. Identitățile incompatibile sau țintele schimbate sunt refuzate; nu ștergeți manifestul, datele sau volumele pentru a forța reluarea.

Încărcarea inițială a catalogului și lucrătorilor are un buget privat de două minute pentru latența Neon. Cele trei locații sunt procesate în paralel, fiecare cu propriile case, stocuri și conturi operaționale. La recuperare, locațiile cu toate comenzile confirmate sunt omise, fără sesiuni noi. Procesul așteaptă închiderea tuturor locațiilor înainte de a închide API-ul privat.

## Verificare

```sh
scripts/pnpm exec vitest run scripts/showcase-seed/seed.test.mjs
scripts/pnpm exec vitest run --config vitest.integration.config.ts tests/showcase-seed.integration.test.ts
# Necesită serverele locale pornite cu scripts/pnpm dev
scripts/pnpm test:e2e --grep 'showcase seed'
```

Testele folosesc numai PostgreSQL local și verifică recuperarea după commit, volumele operaționale, criptarea, RLS/FK cross-tenant, MFA, izolarea locațiilor, proveniența delegării și păstrarea parolelor. Browserul verifică meniul/comenzile pe mobil și activarea administratorului companiei goale.
