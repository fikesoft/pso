# POS — fundație și flux operațional local multi-companie

Next.js + Express + PostgreSQL/Prisma. UI în română, autentificare internă, MFA și autorizare cu delegare controlată. Sunt implementate fundația A/B și fluxul C din [specificație](PROMPT_CODEX_POS_MVP.md): catalog comun/preț local → ciornă persistentă → ticket → preparare. Rutele `/demo/pos` și `/demo/kitchen` rămân demonstrații sintetice distincte. Este adăugată finalizarea cu bon DEMO sau înregistrarea unei încasări confirmate manual. Fiscalizarea, procesarea cardului, 1C și AI nu sunt activate; MVP-ul complet nu este declarat finalizat.

## Pornire pe această mașină

```sh
scripts/pnpm run db:local
scripts/pnpm run dev
```

La prima instalare: `scripts/pnpm install --frozen-lockfile`, `scripts/pnpm run db:generate`, `scripts/pnpm run db:migrate`, `scripts/pnpm run db:migrate --test`, `scripts/pnpm run seed` (dev local; se poate relua pentru completarea catalogului fără resetarea conturilor).

Pentru un checkout local deja pornit, aplicați migrațiile noi în dev/test înainte de repornirea serverelor; nu folosiți reset sau `prisma db push`. Schema și infrastructura PostgreSQL evoluează prin migrații aditive versionate. [Fluxul operațional C](docs/operations.md) explică funcțiile, API-ul, drepturile și limitele.

- Aplicație: http://127.0.0.1:3000
- Platformă privată local: http://127.0.0.1:3001
- Companii sintetice: sakura-demo și bistro-demo; câte două locații și 14 produse demonstrative cu prețuri locale, porții și ingrediente.
- Companie de exercițiu: atelier-demo, doar administrator, fără locații, catalog sau comenzi. [Ghidul seed](docs/demo-seed.md).
- Parole temporare și coduri PIN generate numai local: `.local/dev-accounts.json` (0600). Nu se publică. Schimbare parolă și MFA pentru administratori la primul login.
- Pentru un cont platformă propriu: `scripts/pnpm run bootstrap` (interactiv, nu resetează cont existent).

Pentru lucrători, deschideți `/c/sakura-demo/login` → **Personal · cod PIN** și folosiți codul din `companies[].users[].pin`. Administratorii aleg **Administratori · parolă** și continuă cu MFA; superadministratorul folosește platforma pe portul 3001. [Ghidul PIN](docs/worker-pin.md) explică emiterea, resetarea și conversia conturilor demo existente.

În **Comenzi**, deschideți o comandă trimisă și pregătită (`READY`). **Bon fictiv** o închide în mod DEMO, fără încasare. **Checkout real** înregistrează plata integrală confirmată în numerar/card la terminal și cere dreptul **Înregistrarea încasărilor**. Bonul salvat poate fi redeschis, descărcat și tipărit local. [Finalizarea comenzilor](docs/checkout.md).

**Finalizează comanda** încheie separat operațiunea și consumă rezervarea, fără să înregistreze o plată sau un bon DEMO; cere dreptul local **Finalizarea operațională a comenzilor**. Confirmarea fără trimitere, pregătirea parțială și anularea cu motiv au [tranziții explicite](docs/order-lifecycle.md). [Plățile independente](docs/payments.md) permit preplată după confirmare, încasări parțiale/mixte, încasare după finalizare și rambursări cu motiv. Soldul și istoricul financiar rămân separate de preparare și consum.

În **Inventar**, definiți ingredientele, ambalajele și consumabilele, apoi rețeta fiecărui produs. Materialele se rezervă la trimiterea comenzii la bucătărie și se consumă la finalizare; interfața distinge stocul fizic, rezervat și disponibil. Intrările, pierderile și numărările fizice păstrează motivul și autorul; mișcările sunt separate pe locații. [Ghidul inventarului](docs/inventory.md).

În **Livrări website**, administratorul principal configurează conexiuni și chei pentru o singură locație. Backendul website-ului trimite cheia, POS verifică prețurile și salvează comanda în așteptarea operatorului. Cheile sunt hashate în DB și nu ajung la cumpărător. [Integrarea de livrări](docs/website-delivery.md).

Website HTML/JS local, fără stiluri: configurează cheia numai pe backend cu `scripts/pnpm run website:configure`, apoi `scripts/pnpm run dev:website` → `http://127.0.0.1:3002`. **Cumpără** creează o comandă cu date sintetice în POS-ul local. [Ghidul website-ului de test](docs/delivery-sandbox.md).

Coada persistentă și cache-ul folosesc PostgreSQL. `scripts/pnpm dev` pornește și workerul separat; `scripts/pnpm dev:worker` îl pornește independent. [Joburi și cache](docs/background-jobs.md).

Extinderea HoReCa urmărește [toate cele 196 de ticketuri](docs/horeca-backlog.md), conform [deciziilor beneficiarului](docs/decisions/006-horeca-scope.md). Registrul separă implementările existente de criteriile încă neîndeplinite.

## Pregătire Vercel

Frontendul Next și API-ul Express sunt configurate ca servicii în același proiect Vercel, pe domeniul generic `*.vercel.app`, prin `vercel.json` din rădăcină. Root Directory este rădăcina repository-ului (`.`), Node 24.x. PostgreSQL folosește roluri restrânse într-un proiect Neon, iar fotografiile se păstrează în Vercel Blob privat. Platforma administrativă rămâne un entrypoint local/privat. [Ghidul pas cu pas](docs/vercel.md) include configurarea Neon/Blob, variabilele, migrațiile și prima companie. Nu s-a făcut deploy, upload sau creare de resurse cloud.

## Verificare

```sh
scripts/pnpm run check:style
scripts/pnpm run format:check
scripts/pnpm run db:validate
scripts/pnpm run test
scripts/pnpm run test:db
scripts/pnpm run test:integration
scripts/pnpm run typecheck
scripts/pnpm run lint
scripts/pnpm run build
scripts/pnpm run test:e2e
```

Structura FSD, proprietatea tipurilor/constantelor și limitele de 150/300 linii sunt descrise în [convențiile de cod](docs/code-style.md). `scripts/pnpm run format` aplică același format în frontend și backend; `lint` verifică și arhitectura.

Testele DB/HTTP cer bază PostgreSQL reală locală. E2E cere serverele pornite și Chromium (`scripts/pnpm exec playwright install chromium`). Nu folosiți aceste teste pe producție.

[Arhitectură](docs/architecture.md) · [Date](docs/data-model.md) · [Flux operațional C](docs/operations.md) · [Autorizare](docs/authorization.md) · [Securitate](docs/security.md) · [UI](docs/ui-flows.md) · [Pornire și operațiuni](docs/deployment.md) · [Backlog](docs/backlog.md) · [Rezultate verificare](docs/verification.md)

Nu s-a făcut deploy și nu s-au executat operațiuni Git. Configurațiile de producție sunt șabloane ce necesită verificarea operatorului; rezultatul nu este declarat production-ready.
