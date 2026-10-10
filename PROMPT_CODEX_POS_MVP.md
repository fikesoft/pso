# Prompt Codex — POS multi-companie: analiză tehnică și inițializare

Versiune: 1.0 · 6 septembrie 2026  
Limba explicațiilor și a UI-ului inițial: română. Identificatori și cod: engleză.

Acest fișier este o specificație de lucru, nu dovada că aplicația, controalele de securitate sau integrările sunt implementate. Citește-l integral, apoi lucrează în repository-ul curent. Nu te limita la un plan: după analiză, construiește fundația rulabilă descrisă în secțiunea „Execuția curentă”. Nu încerca să livrezi tot POS-ul într-o singură implementare netestată.

## 1. Context și decizii deja luate

Construim o platformă POS pentru Republica Moldova, cu mai multe companii independente, fiecare cu unul sau mai multe restaurante/locații. Nori Sushi este primul client-pilot, nu un tenant special în logica aplicației. Referințe conceptuale furnizate de beneficiar: YUMA POS și Quick Resto; nu reproduce brandul, codul sau toate funcțiile lor.

Prioritățile produsului sunt comenzile, încasările, controlul numerarului, rapoartele, delegarea sigură a accesului și analiza AI. Integrarea cu 1C și fiscalizarea vor fi validate cu instalația și echipamentele clientului. 100 de lucrători în total este o țintă de capacitate, nu 100 de utilizatori simultani confirmați. Pregătește teste pentru ambele situații și nu promite capacitatea unui VPS fără măsurători.

Stackul este fixat:
- Next.js App Router, React și TypeScript.
- Tailwind CSS și shadcn/ui pentru un prototip simplu, responsive.
- Express și TypeScript pentru backend; monolit modular.
- PostgreSQL și Prisma pentru date și migrații.
- Zod pentru contracte și validare, Axios pentru HTTP; Redux Toolkit pentru stare UI și ciorna comenzii, nu ca autoritate financiară.
- Autentificare internă, cu login și parolă. Fără OAuth, Google/GitHub login, înregistrare publică sau furnizor extern de identitate.
- Fără Supabase, Strapi, NestJS, Kubernetes sau microservicii introduse implicit.
- AI prin API, numai din backend; furnizorul/modelul nu sunt încă decise.
- Deploy inițial pe VPS cu Docker Compose. AWS Lightsail este o opțiune ulterioară, nu o migrare obligatorie sau deja decisă.

Verifică versiunile stabile și compatibile înainte de instalare: Node LTS, Next.js, Express, Prisma, PostgreSQL, shadcn și pnpm. Fixează versiunile și lockfile-ul. Nu folosi din memorie configurări Prisma din altă versiune și nici tagul Docker `latest` în configurația de producție. Documentează ce ai verificat și eventualele limitări de acces la documentație.

## 2. Ierarhia de administrare și identitățile

Ierarhia business:

```text
PlatformOwner — Sorin, Super Admin al platformei
  └─ Organization — companie-client
      ├─ PrimaryAdmin — administratorul principal creat de Sorin
      ├─ Location A — restaurant
      │   ├─ administrator delegat
      │   ├─ chelner / casier
      │   └─ personal bucătărie
      └─ Location B — restaurant
          └─ personal atribuit
```

`Organization` este limita tenantului. Un restaurant este `Location`, nu o companie nouă în mod automat. În UI folosește „Administrator principal” pentru contul creat de platformă, ca să nu-l confunzi cu Super Admin sau cu administratorii delegați. Administratorul principal are toate locațiile propriei companii, inclusiv cele viitoare, niciodată alte companii.

Super Admin creează compania și administratorul principal; nu trebuie să creeze fiecare lucrător. Administratorul principal creează locații, roluri și conturi individuale cu login/parolă. El poate autoriza alți administratori să creeze lucrători și să le atribuie anumite drepturi, numai în locațiile permise.

Loginul este unic în companie, cu normalizare explicită. Pagina propusă este `/c/{companySlug}/login`; slugul selectează namespace-ul, nu autorizează accesul. Nu există cont comun pentru toți angajații unui restaurant. Pentru fundație, un `CompanyUser` aparține unei singure organizații și poate avea mai multe locații. Conturile platformei sunt un tip de identitate separat; nu implementa multi-companie pentru aceeași identitate de personal fără o cerință nouă.

La crearea unui cont, parola inițială poate fi generată criptografic sau introdusă de creator. Este temporară, are termen de activare configurabil și trebuie schimbată înainte de accesul operațional. Parola temporară este afișată o singură dată, niciodată în liste, jurnale, audit, analytics sau URL-uri. Resetarea nu recuperează parola veche.

Păstrează conturile dezactivate pentru referințele istorice. Retragerea unei locații sau dezactivarea utilizatorului trebuie să retragă accesul imediat, nu abia la expirarea unui JWT de lungă durată. Nu permite ștergerea/dezactivarea ultimului administrator principal activ prin interfața personalului. Transferul responsabilității principale este o operațiune privilegiată separată, nu o simplă bifă într-un rol.

## 3. Autorizare: utilizare, delegare și limite

Nu implementa un singur enum de roluri care decide totul și nici autorizare doar în frontend. Creează un serviciu central `AuthorizationService`, deny-by-default, folosit de toate API-urile, exporturile, joburile și funcțiile AI. [R1, R2]

Trebuie să poată răspunde separat la:

```text
canUse(actor, action, resourceContext)
canGrant(actor, targetUser, permission, scope, limits)
canManageUser(actor, targetUser, operation)
```

### Reguli obligatorii

1. „Poate executa o acțiune” nu înseamnă „poate acorda acțiunea altcuiva”. Dreptul `staff.create` nu permite implicit acordarea oricărui rol.
2. Pentru un administrator delegat, drepturile acordate trebuie să fie în intersecția dintre drepturile sale efective și plafonul explicit de delegare, în aceeași companie și în locațiile autorizate. Limitele de sumă/procent nu pot fi relaxate.
3. `ORGANIZATION` și `LOCATION` sunt domenii explicite. Un drept pe o locație nu devine drept pe companie. Nu combina permisiuni din locații diferite printr-o unire globală incorectă.
4. Modificările individuale folosesc ALLOW/DENY; un DENY aplicabil are prioritate. Nu inventa reguli contradictorii între interdicții la nivel de companie și excepții locale.
5. Crearea unui administrator este posibilă numai în plafonul permis. Nu permite promovarea în PrimaryAdmin/PlatformOwner, modificarea propriului plafon sau schimbarea accesului unui superior.
6. Resetarea parolei este o operațiune sensibilă: administratorul delegat o poate face numai pentru persoane pe care le poate administra. Nu îi permite resetarea parolei administratorului principal sau eliminarea MFA-ului acestuia.
7. Rolurile se pot modifica, dar modificarea unui rol nu trebuie să fie o cale de escaladare pentru utilizatorii cărora le-a fost atribuit. Preferă versiuni imuabile de rol: o versiune nouă se aplică prin reatribuire explicită, verificată și auditată.
8. Orice grant derivat trebuie să păstreze proveniența. Revocarea/restrângerea delegării trebuie să dezactiveze drepturile derivate nevalide sau să le facă ineficiente la evaluare. Nu șterge operațiunile istorice.
9. Separă `createdBy` de cine are drept de administrare asupra unui utilizator. Pentru prima versiune, administratorii delegați administrează numai personalul subordonat explicit, nu orice coleg din tenant.
10. MFA, revocarea sesiunilor și auditul se aplică și modificărilor de rol, nu numai loginului.

Pentru prima implementare, prioritizează lanțul PrimaryAdmin → administrator delegat → lucrător. Mai departe, re-delegarea este interzisă implicit. Poate fi modelată prin `parentGrantId` și `canRedelegate`, dar nu activa această opțiune până când verificarea tuturor strămoșilor, prevenirea ciclurilor și testele de revocare nu există. Nu expune un checkbox care promite o funcție neimplementată.

Exemplu obligatoriu de test: PrimaryAdmin îi dă Anei acces la locația A, `staff.create`, `staff.credentials.reset` și posibilitatea de a acorda `orders.read`, `orders.create`, `kitchen.read` în A. Ana poate crea un chelner cu aceste drepturi în A. Nu poate acorda `payments.refund`, `reports.cost.read`, acces la B, `staff.delegate` sau acces la platformă. Interdicția trebuie să reziste inclusiv modificării payloadului și folosirii unui rol aparent inofensiv editat ulterior.

UI-ul trebuie să distingă „Poate folosi” de „Poate acorda”, să arate locațiile și proveniența dreptului și să ofere o previzualizare a accesului efectiv înainte de salvare.

## 4. Securitatea Super Admin și a conturilor restaurantelor

### 4.1. Administrarea platformei este privată

Sorin dorește acces numai de la calculatorul său de acasă. Propune o combinație de controale, nu promite identificarea fizică absolută prin IP:
- Control plane privat: panoul și API-ul platformei nu sunt publicate pe interfața publică a VPS-ului.
- WireGuard cu un singur peer autorizat pentru calculatorul proprietarului. Cheile se generează local/pe host, nu în repository. [R6]
- Restricție pe IP-ul public de acasă la firewall atunci când există IP stabil. Dacă este dinamic, documentează actualizarea sigură sau obținerea unui IP static; nu deschide automat accesul către toate IP-urile.
- Pentru o legare suplimentară de dispozitiv, certificat client mTLS la reverse proxy. Documentează emiterea, instalarea, expirarea și revocarea. [R13] Un certificat/cheie exportabilă poate fi copiată; nu prezenta asta ca dovadă infailibilă a dispozitivului fizic.
- Login intern și MFA obligatoriu pentru Super Admin. TOTP local este acceptabil; un factor hardware/phishing-resistant poate fi adăugat ulterior, fără OAuth.
- Sesiune scurtă, reautentificare pentru operațiuni critice și recuperare de urgență documentată, printr-un canal administrativ separat protejat.

IP-ul identifică o conexiune/rețea, nu singur un calculator. Nu folosi MAC, fingerprint de browser sau un header trimis de client ca autentificare de dispozitiv. WireGuard autentifică deținerea unei chei; compromiterea calculatorului sau furtul cheilor rămân riscuri.

Propune două entrypoint-uri Express care reutilizează același monolit modular: `public-server` și `platform-server`. Routerele platformei nu se montează în serverul public. Pentru frontend, preferă un `platform-web` minimal separat, care reutilizează componentele UI, dacă aceasta simplifică izolarea. Nu dubla logica de business și nu numi această separare o migrare la microservicii.

Nu pune public un API administrativ doar pentru că linkul UI este ascuns. Nu accepta un header `X-Is-Admin` sau un `Host` arbitrar ca dovadă. Cookie-urile, sesiunile și credențialele DB ale platformei sunt separate de cele ale utilizatorilor restaurantelor. Un token tenant nu trebuie acceptat de API-ul platformei și invers.

Nu configura efectiv firewallul, WireGuard sau conturi cloud în execuția curentă. Livrează șabloane și preflight checks cu variabile de completat, fără risc de blocare a utilizatorului pe server. În producție, lipsa configurării private trebuie să dezactiveze accesul platformei/facă verificarea să eșueze, nu să îl publice ca fallback. Dev-ul local are o configurație separată, explicită și exclusiv pe loopback.

### 4.2. Securitatea autentificării tenantului

Folosește hashing Argon2id, biblioteci întreținute, sesiuni opace persistate pe server, cookie-uri host-only HttpOnly/Secure și SameSite adecvat, CSRF pentru operațiunile de modificare și verificarea Origin. Nu stoca tokenuri de autentificare în localStorage. [R3, R4]

Tokenurile de sesiune persistente, de pairing și de resetare se stochează sub formă de hash, nu în clar. Secretul TOTP necesită criptare, nu hashing, și o cheie de criptare păstrată separat. Codurile de recuperare se pot stoca prin hash. Folosește verificarea anti-replay și limitarea încercărilor inclusiv pentru MFA.

MFA obligatoriu pentru PrimaryAdmin și persoanele care gestionează acces/credențiale înainte de producție. Prima activare MFA este un flux limitat; sesiunea de preautentificare nu oferă acces business. Lucrătorii pot folosi login/parolă și blocare automată; eventualul PIN rapid nu înlocuiește autentificarea de bază și nu este obligatoriu în fundație.

Rate limiting pentru login pe IP și cont/tenant, mesaje generice pentru combinații invalide, protecție la enumerarea companiilor și timeouturi. Nu impune IP fix chelnerilor mobili; limitarea de acasă este numai pentru Super Admin.

Nu seta `trust proxy = true` fără modelul exact al rețelei. Acceptă numai proxy-urile cunoscute și suprascrie headerele forwarded la proxy. Testează falsificarea `X-Forwarded-For`. [R7]

## 5. Modelul bazei de date

Furnizează o schemă conceptuală completă a MVP-ului, un ERD Mermaid și dicționarul de date. În migrațiile execuției curente implementează numai fundația de identitate/acces și tabelele necesare scenariului demonstrat. Restul modelelor trebuie marcate PLANIFICATE, nu endpoint-uri fictiv funcționale.

### 5.1. Convenții și integritate

UUID pentru identități; `organizationId` pe datele tenantului; `locationId` pe operațiunile locale. Chei externe compuse acolo unde trebuie împiedicate relațiile cross-tenant, inclusiv între utilizatori, roluri, locații, comenzi și plăți. Un simplu UUID global unic nu garantează apartenența corectă.

Utilizează `timestamptz` pentru momente, timezone IANA `Europe/Chisinau` în configurarea companiei/locației și o regulă explicită pentru ziua operațională. Un moment stocat nu păstrează singur timezone-ul IANA; salvează această configurare separat. [R10]

Pentru bani: Decimal/numeric exact, de exemplu `numeric(18,2)` pentru sume decontate și precizie mai mare pentru prețuri unitare, cantități și costuri. Decide și documentează precizia și rotunjirea; nu utiliza float sau `Number` pentru aritmetica monetară. În API serializează sumele ca stringuri zecimale. Monedă MDL implicit; nu promite multi-currency în MVP.

Statusuri explicite, `createdAt/updatedAt`, autor, motiv pentru acțiuni sensibile și versiune pentru concurență. Constrângeri CHECK și indexuri parțiale trebuie incluse în migrații SQL când nu sunt exprimate de versiunea Prisma aleasă. Nu le omite pentru a păstra schema „pur Prisma”. [R9]

Nu face cascade delete pentru istoric financiar sau audit. Dezactivează/arhivează utilizatorii și produsele. Auditul este append-only pentru rolurile aplicației, nu „imposibil de modificat” pentru proprietarul serverului.

### 5.2. Fundația de implementat

| Model | Câmpuri/relații esențiale și rol |
|---|---|
| PlatformAdmin | login normalizat, passwordHash, stare, MFA, authVersion; identitate separată |
| PlatformSession | tokenHash, platformAdminId, expirare absolută/inactivitate, nivel MFA, revokedAt |
| Organization | slug unic, nume comercial/juridic, currency, timezone, stare, primaryAdminUserId, policyVersion |
| Location | organizationId, code unic în tenant, nume, adresă, timezone/zi operațională, stare |
| CompanyUser | organizationId, loginNormalized, displayName, passwordHash, mustChangePassword, activatedAt, stare, authVersion, createdBy, managedByUserId |
| UserLocationAccess | organizationId, userId, locationId, isDefault; fără duplicate; cel mult o locație implicită |
| Permission | catalog global de acțiuni definit de platformă, scope permis și dacă poate fi delegată; tenantul nu poate inventa privilegii de platformă |
| Role | organizationId, nume, descriere, stare; șablon de business, nu rang global |
| RoleVersion / RolePermission | versiune imuabilă a rolului și permisiunile/limitele sale |
| UserRoleAssignment | user, roleVersion, scopeType, locationId când este local, issuer, delegationGrantId când este derivat |
| UserPermissionOverride | ALLOW/DENY pe acțiune și scope, limite, emitent, proveniență; protejează eliminarea unui DENY |
| DelegationGrant / DelegationGrantPermission | beneficiarul, emitentul, plafonul delegabil, scope, limite, stare; parentGrantId și canRedelegate rezervate sau implementate explicit |
| TenantSession | tokenHash, organizationId, userId, authVersion/policyVersion, MFA, expirare și revocare; fără drepturi imuabile pe termen lung |
| MfaCredential / RecoveryCode | tip de principal explicit, secret criptat sau hash după caz, stare și enrollment |
| AuditEvent | tenant/locație unde se aplică, actorul explicit, acțiune, țintă, câmpuri sanitizate, rezultat, requestId |

Definește CHECK-uri pentru scope: ORGANIZATION nu are locationId, LOCATION are locationId. Evită dublurile apărute prin semantica NULL în indexuri unice; testează explicit ambele scope-uri.

Pentru `Organization.primaryAdminUserId`, tratează crearea circulară într-o tranzacție/procedură de provisioning: draft company, user, asociere primary admin, activare. Nu expune o companie activă fără contul responsabil. Referința trebuie să garanteze că userul este din aceeași organizație. Modificarea ei este rezervată control plane-ului/procedurii privilegiate.

`createdBy` și orice legătură către un actor de platformă trebuie modelate fără FK polimorf nevalidat. Folosește referințe nullable separate cu CHECK sau un alt model explicit verificabil.

### 5.3. Dispozitive și bucătărie

| Model | Scop |
|---|---|
| Device | organizationId, locationId, tip/purpose, nume, stare, lastSeenAt, revocare |
| PairingRequest | secret/challenge temporar, termen, confirmare de către un utilizator autorizat, utilizare unică |
| DeviceSession | tokenHash, deviceId, expirare și revocare, permisiuni tehnice minimale |

Un TV are identitate tehnică pentru vizualizarea bucătăriei, nu cont de administrator. Tokenul său nu poate crea utilizatori, vedea rapoarte sau înregistra plăți. Un dispozitiv care schimbă starea preparării trebuie tratat separat; pentru atribuire individuală folosește o sesiune de personal, nu pretinde că o acțiune de pe TV identifică un om.

### 5.4. Domeniul POS — de proiectat pentru etapele următoare

| Domeniu | Modele și cerințe |
|---|---|
| Catalog | Category, Product, ProductVariant, ModifierGroup, ModifierOption, ProductModifierGroup, BundleComponent, LocationProduct, ProductCostVersion |
| Servire | DiningTable simplu, Order, OrderItem, OrderItemModifier, OrderStatusEvent; nu editor de sală complex |
| Bucătărie | KitchenTicket, KitchenTicketItem; versiune, stări și revizuiri trimise după modificarea comenzii |
| Plăți | Payment, Refund, RefundItem, PaymentAttempt; referințe, confirmare manuală/automată, idempotență |
| Casierie | CashRegister, Shift, CashAccount, CashMovement; transferul de cash nu este încasare nouă |
| Costuri | Expense, ExpensePayment, categorii și documente; costurile necunoscute nu devin zero |
| Fiscal | FiscalDocument, FiscalAttempt; stare și referință externă, inclusiv UNKNOWN_REQUIRES_REVIEW |
| Integrări | IntegrationConnection, ExternalMapping, OutboxEvent, IntegrationAttempt; mapări și credențiale izolate per companie |
| Fișiere | FileAsset cu tenant, scop și acces; fișiere private pentru documente și exporturi |
| AI | AIConversation, AIMessage, AIUsage; scope autorizat și date minimale, fără logarea cheilor |
| Fiabilitate | IdempotencyRecord cu tenant, operațiune, key, requestHash, status, referință rezultat și retenție definită |

Produsele aparțin companiei; `LocationProduct` definește activarea și prețul local. Seturile au venit o singură dată, componente separate pentru bucătărie. Comanda păstrează snapshotul denumirii, prețului, reducerilor, taxelor și costului cunoscut. Nu citi prețul curent pentru un raport istoric.

Un Order are separat starea operațională, starea preparării/predării, a plății și a fiscalizării. Fiecare Payment aparține comenzii și aceleiași locații/companii. Totalul rambursărilor nu poate depăși suma eligibilă nici sub concurență; un CHECK simplu pe un rând nu este suficient pentru o sumă între rânduri.

Adaugă indexuri pe `(organizationId, locationId, status, createdAt)` după interogările reale, lookup de login/session, outbox pending și raportare temporală. Nu indexa orbește toate coloanele. Folosește paginare și limite pentru rapoarte/exporturi.

### 5.5. Row-Level Security și Prisma

RLS este protecție suplimentară pentru izolarea tenantului, nu înlocuitor pentru autorizarea pe locație/acțiune/coloană. Rolul DB de runtime nu trebuie să fie owner, superuser sau BYPASSRLS. Folosește roluri separate pentru migrații, runtime, worker și provisioning, cu privilegii minime. [R5]

Implementează un helper `withTenantTransaction(validatedContext, fn)` care setează contextul folosind o operațiune parametrizată și setare LOCAL tranzacției, de exemplu `set_config(..., true)`, apoi execută numai prin clientul tranzacției. Fără context valid, accesul eșuează închis. Nu seta tenantul persistent pe o conexiune din pool și nu ieși accidental pe clientul Prisma global în interiorul helperului.

Documentează explicit bootstrapul de login și session lookup înainte de a avea un tenant autentificat: lookup minimal printr-un rol/funcție restrânsă, nu BYPASSRLS global. Nu expune credentialele prin API și nu da control plane-ului acces universal la tabelele financiare numai pentru a crea o companie.

Testează USING și WITH CHECK, interogări brute, inserări cross-tenant, join-uri, context absent și pool reutilizat succesiv pentru companiile A/B. Nu valida RLS cu rolul de migrații. Unde schema Prisma nu exprimă politicile, folosește migrații SQL versionate.

## 6. UI responsive: mobil, tabletă, desktop și TV

Nu micșora aceeași pagină desktop pentru toate dispozitivele. Construiește layouturi adaptate rolului, folosind aceleași contracte și componente de bază. shadcn are un model Dialog pe desktop / Drawer pe mobil, dar utilizabilitatea rămâne de verificat în aplicație. [R11]

- Mobil chelner, inclusiv 360 px lățime: navigare simplă jos, mese/comenzi, produse ușor de găsit, coș sticky, modificatori într-un drawer, ținte tactile propuse de minimum 44 px. Fără dependență de hover sau gesturi nedescoperibile.
- Tabletă/casier: produse și comandă în panouri, acțiunile de încasare vizibile, focus și tastatură funcționale.
- Desktop admin: sidebar, tabele filtrabile, formulare clare, matrice de permisiuni. Pe mobil tabelele devin carduri/detaliu; nu pierde accesul la funcții administrative.
- TV bucătărie: mod dedicat 16:9, tipografie mare, contrast bun, comenzi/timer/observații, vizibil de la distanță, fără telefon/adresă/prețuri dacă nu sunt necesare. Testează 1920×1080 și 3840×2160, fără a garanta compatibilitatea oricărui browser Smart TV.
- Afișează mereu compania, locația și identitatea/contextul de dispozitiv. La schimbare tenant/locație/logout golește cache-ul și drafturile care nu mai sunt autorizate.

TV-ul se asociază prin cod/challenge temporar confirmat de un administrator autorizat de pe alt dispozitiv. Nu se introduce parola administratorului în browserul TV și nu se pune tokenul permanent în URL. Canalul de pairing trebuie rate-limitat, cu confirmare a scopului și revocare. Prototipul TV poate porni cu date sintetice marcate „DEMO”, fără pretinderea pairingului real dacă nu e implementat.

Culori neutre, un accent, animații minime, focus vizibil și texte în română din dicționare pregătite pentru localizare. Evită KPI inventate, landing page de marketing și efecte inutile. Permisiunile sunt explicate prin „Poate folosi” / „Poate acorda”, nu coduri interne neexplicate.

Testează 360×800, 390×844, 768×1024, 1440×900 și TV. Lipsa orizontal overflow se aplică paginii; conținutul explicit scrollabil are affordance clar. Include stări loading, empty, error, forbidden, saving, saved, stale/offline și confirmări pentru operațiuni sensibile.

## 7. Domeniul funcțional și lucruri care nu se inventează

MVP final: companii, locații, personal și delegare; catalog comun/prețuri locale; comenzi pentru masă, ridicare, livrare; bucătărie; plăți și retururi; ture, cash, cheltuieli; rapoarte pe locație și consolidate; costuri estimate; audit; integrare 1C verificată; circuit fiscal validat; AI de citire.

Nu construim acum inventar complet, salarii, fidelizare, aplicație client, optimizare de livrări, subscriptions SaaS, Kubernetes, integrare cu toate băncile sau toate configurațiile 1C.

AI-ul folosește funcții backend limitate, nu SQL liber. Backendul calculează banii, AI-ul explică. Pagina poate avea shell în prototip, dar nu inventa răspunsuri financiare și nu apela un furnizor fără configurarea și aprobarea corespunzătoare. Consumul se atribuie companiei, fără date din alte tenanturi. Nicio cheie în browser.

1C și fiscalizarea sunt două integrări diferite. Tipurile/documentele și echipamentele nu sunt confirmate. Creează contracte și adaptoare neactivate; nu pretinde că un CSV generic este integrare contabilă sau că imprimarea unui bon este fiscalizare. Starea de rezultat extern necunoscut se verifică înainte de repetare.

Raportarea distinge vânzări, TVA, încasări, decontări bancare, sume de încasat, comisioane și retururi. „Marjă estimată” nu se numește „profit real”. Nu introduce cote fiscale din memorie; cere validarea de către contabil înainte de producție.

Online-first este ipoteza de pornire. O PWA nu înseamnă offline financiar complet. O ciornă nesincronizată nu se afișează ca vânzare confirmată. Cerințele de vânzare fără internet se analizează înainte de pilotul operațional.

## 8. Deploy portabil pe VPS

Propune un monorepo pnpm:

```text
apps/web             # Next.js: companii, personal, chelner/casier, bucătărie
apps/platform-web    # Next.js minimal privat pentru Super Admin
apps/api             # Express public/platform, aceleași servicii de business
apps/worker          # pregătit pentru joburi persistente, nu integrări fictive
packages/db          # Prisma + migrații SQL
packages/contracts   # Zod + DTO-uri publice, fără modele cu passwordHash
packages/authz       # evaluator central, testabil
packages/ui          # componente Tailwind/shadcn comune unde sunt utile
infra/               # Docker, proxy, exemple firewall/VPN, runbooks
```

Poți simplifica structura dacă repository-ul existent impune altceva, cu ADR și fără reducerea limitelor de securitate. Nu crea zeci de pachete goale sau două sisteme de build concurente.

În producție: Docker Compose, reverse proxy TLS, containere non-root unde este posibil, healthchecks, restart policy, volume persistente și log rotation. PostgreSQL și API-urile interne nu publică porturi pe internet; în dev, porturile auxiliare sunt legate de 127.0.0.1. Accesul public este către web/API tenant, nu către control plane.

Verifică interacțiunea Docker cu firewallul: porturile publicate pot ocoli așteptările bazate numai pe UFW. Nu considera `ufw deny` dovadă suficientă că un port Docker nu este expus. [R8]

Nu introduce Redis din inerție. Sesiunile și outboxul pot porni în PostgreSQL; dacă o dependență suplimentară rezolvă un risc concret, justific-o. Pentru joburi folosește lease/claim, backoff, timeout și recuperare după crash; efectele externe sunt at-least-once cu deduplicare, nu „exactly once” garantat.

Pregătește backup extern criptat și runbook de restaurare, inclusiv fișiere. Înainte de producție trebuie decise RPO/RTO și, dacă este necesar, arhivarea WAL/PITR; backupul zilnic nu oferă singur protecție suficientă tranzacțiilor recente. Un singur VPS este un punct unic de defectare; nu promite high availability.

Migrarea eventuală la Lightsail trebuie să poată reutiliza imaginile Docker, migrațiile și configurarea. Documentează separat transferul DB/fișierelor, fereastra de mentenanță, validarea, DNS, rollback și schimbarea rolurilor/conexiunilor când baza devine administrată. Nu crea acum resurse plătite.

## 9. Execuția curentă: ce faci efectiv acum

### Etapa A — inspectare și analiză

Inspectează repository-ul curent, `AGENTS.md`, package manifests, lockfiles, schema DB și starea Git. Nu șterge și nu suprascrie munca existentă. Nu căuta în directoare personale fără legătură și nu imprima secrete. Dacă este gol, inițializează-l.

Redactează documente utile, nu zeci de pagini generice:
- `docs/architecture.md`: limite, componente, fluxuri și decizii.
- `docs/data-model.md`: ERD, tabele, chei, indexuri, tranzacții, RLS și ce este implementat/planificat.
- `docs/authorization.md`: matrice use/grant, override-uri, scope, versiuni și revocare.
- `docs/security.md`: threat model, auth, tenant isolation, control plane și limite reziduale.
- `docs/ui-flows.md`: ecrane și comportamente mobile/TV.
- `docs/deployment.md`: VPS, configurarea privată, backup și viitoarea opțiune Lightsail.
- `docs/backlog.md`: milestone-uri și criterii de acceptare.
- `docs/decisions/`: ADR-uri numai pentru alegeri importante.

Nu bloca proiectul pe furnizorul AI, adresa IP reală, numărul exact al restaurantelor, echipamentul fiscal sau versiunea 1C. Marchează aceste informații ca neconfirmate, păstrează funcțiile dependente dezactivate și continuă cu fundația.

### Etapa B — fundație rulabilă și testată, prioritatea principală

Implementează monorepo-ul, configurațiile TypeScript, validarea env, lint/typecheck, Docker local și PostgreSQL. Creează schema și migrațiile fundației, inclusiv rolurile DB/RLS, apoi autentificarea internă și sesiunile separate.

Implementează fluxul end-to-end:

```text
Super Admin local/privat
→ creează companie și administrator principal
→ administratorul schimbă parola și configurează MFA
→ creează două locații
→ configurează un rol și un plafon de delegare
→ creează administrator delegat
→ acesta creează un lucrător cu permisiuni limitate în locația A
→ lucrătorul intră și vede numai contextul și funcțiile permise
→ administratorul principal retrage un drept
→ accesul este retras și în cereri directe, nu doar în meniu
```

Include login, logout, sesiunea curentă, schimbarea parolei, resetare autorizată, gestionarea locațiilor și personalului, roluri/versionare, delegare, previzualizarea accesului efectiv și listarea auditului în scope.

UI-ul de identitate/acces trebuie să consume API real, nu fixture-uri cu butoane decorative. În aceeași fundație poți livra shell-uri responsive de chelner/POS și TV bucătărie, cu fixture-uri locale marcate explicit DEMO. Nu amesteca datele demo cu rapoarte reale.

Creează minimum două companii sintetice, fiecare cu două locații și conturi cu drepturi diferite. Seedul este numai pentru dev/test. Nu introduce parole fixe de producție în cod. Bootstrapul Super Admin este o comandă locală/privată interactivă ori cu secret temporar furnizat în siguranță; nu este endpoint public și nu resetează contul la fiecare pornire.

### Etapa C — numai după fundația verificată

Poți începe un flux minimal protejat de catalog → comandă draft → ticket bucătărie dacă testele etapei B trec și execuția permite. Nu începe plăți reale, fiscalizare sau conectori reali în detrimentul autentificării și izolării.

## 10. Teste și verificări obligatorii

Folosește unit tests pentru evaluatorul de acces, integrare pe PostgreSQL real pentru RLS/constrângeri și browser E2E pentru fluxurile complete. Nu înlocui testele RLS cu SQLite sau mock-uri Prisma.

Scenarii minime:
1. Loginuri identice în companii diferite nu creează acces încrucișat.
2. Company A nu citește/modifică datele B prin ID, filtru, body, URL sau export.
3. Un user cu locația A nu vede B; scope-ul organizațional nu se obține dintr-un scope local.
4. Administratorul delegat poate crea un lucrător în plafon, dar nu poate acorda costuri/retururi/locații suplimentare.
5. Editarea versiunii unui rol sau override-ul individual nu ocolește granturile și DENY-urile.
6. Nu există autopromovare, modificarea propriului plafon, resetarea parolei unui superior sau atribuirea PrimaryAdmin prin API de personal.
7. Revocarea unui grant și dezactivarea unui emitent retrag drepturile derivate conform politicii documentate; sesiunile vechi nu le reactivează.
8. Parola temporară nu dă acces business înainte de schimbare și de MFA-ul necesar; nici sesiunea pre-MFA.
9. Resetarea/dezactivarea invalidează sesiunile; cookie flags și CSRF sunt verificate.
10. API-ul platformei nu este montat pe entrypoint-ul public; tokenurile tenant/platform sunt incompatibile; X-Forwarded-For fals nu deschide accesul.
11. Fără context RLS nu există date; o conexiune reutilizată A→B nu păstrează tenantul anterior; relațiile cross-tenant sunt respinse de DB.
12. Nicio parolă/token/cheie nu apare în DTO-uri, audit sau loguri.
13. Viewporturile mobile/TV nu pierd funcții; tastatura, focusul, stările de eroare și overflow-ul sunt verificate.
14. DeviceSession, dacă este implementată, nu poate apela API de utilizatori/plăți și nu poate schimba locația prin payload.
15. Comanda de seed refuză mediul de producție; bootstrapul nu creează o parolă implicită permanentă.

Pentru etapele financiare, documentează acum testele ce urmează: dublu click/idempotență, requestHash diferit cu aceeași cheie, retururi concurente, modificări simultane de comenzi, istoricul prețurilor, outbox retries, rezultat fiscal necunoscut și reconcilierea turei.

Rulează comenzile disponibile: instalare cu lockfile, Prisma validate/generate, migrații pe DB de test, lint, typecheck, unit/integration tests, build și E2E. Creează scripturi reproductibile în package.json și CI potrivite repository-ului existent. Nu pretinde că ai rulat ceva când Docker, baza sau browserul nu sunt disponibile; înregistrează limitarea și comanda exactă de reluare.

## 11. Reguli pentru lucru și livrare

Păstrează documentele de referință și contractele existente dacă sunt valide. Folosește schimbări incremental verificabile. Nu executa `migrate reset`, ștergeri de volume, rescrieri distructive Git, dezactivarea protecțiilor sau deploy în producție fără autorizare specifică.

Nu cere din nou preferințe deja fixate în acest prompt. Pentru decizii necritice, alege o opțiune simplă, explică într-un ADR și continuă. Pentru informații critice lipsă, construiește interfața/configurarea sigură și marchează blocajul punctual; nu inventa credențiale, IP-uri sau succesul unei integrări.

Creează/actualizează un `AGENTS.md` scurt cu invariabilele de securitate, structura, comenzile și Definition of Done, fără a suprascrie instrucțiuni existente incompatibil. Promptul complet rămâne document de proiect; nu-l copia integral în AGENTS.md. [R12]

La final prezintă:
- Ce ai găsit în repository și deciziile luate.
- Ce funcționează efectiv și ce rămâne doar proiectat/demo.
- Fișierele importante și pașii de pornire locală.
- Testele rulate, rezultatele și cele nerulate cu motiv.
- Riscurile/blocajele concrete înainte de producție.
- Următorul milestone mic, verificabil.

Nu numi rezultatul „production-ready” numai fiindcă pornește, are login și un dashboard. Fundația este acceptată când fluxul de creare și delegare funcționează, izolarea este testată și interfețele sunt utilizabile pe dispozitivele vizate.

## 12. Referințe tehnice pentru reverificare

Aceste surse susțin mecanismele tehnice, nu certifică proiectul propus. Verifică documentația curentă a versiunilor efectiv instalate. Cerințele funcționale și schema propusă provin din deciziile proiectului.

```text
[R1] OWASP — Authorization
https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
[R2] OWASP — Multi-Tenant Security
https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
[R3] OWASP — Password Storage
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
[R4] OWASP — Session Management / Authentication
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
[R5] PostgreSQL — Row Security Policies
https://www.postgresql.org/docs/current/ddl-rowsecurity.html
[R6] WireGuard — Protocol model and setup
https://www.wireguard.com/
https://www.wireguard.com/quickstart/
[R7] Express — Behind proxies
https://expressjs.com/en/guide/behind-proxies/
[R8] Docker — Packet filtering and firewalls
https://docs.docker.com/engine/network/packet-filtering-firewalls/
[R9] Prisma — Database features / migrations
https://www.prisma.io/docs/
[R10] PostgreSQL — Date/time and numeric types
https://www.postgresql.org/docs/current/datatype-datetime.html
https://www.postgresql.org/docs/current/datatype-numeric.html
[R11] shadcn/ui — Components and responsive drawer/dialog
https://ui.shadcn.com/docs/components/base/drawer
[R12] OpenAI — Codex instructions with AGENTS.md
https://developers.openai.com/codex/guides/agents-md
[R13] NGINX — TLS client certificate verification
https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_verify_client
```
