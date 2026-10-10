export const pinMessages = {
  loginMode: 'Mod de autentificare',
  workerMode: 'Personal · cod PIN',
  administratorMode: 'Administratori · parolă',
  loginHint: 'Intră direct cu codul PIN personal primit de la administrator.',
  pinLabel: 'Cod PIN',
  pinHint: '9–32 de litere și cifre. Codul identifică propriul cont în această companie.',
  loginAction: 'Intră cu cod PIN',
  methodLabel: 'Metodă de autentificare',
  pinMethod: 'Cod PIN · personal',
  passwordMethod: 'Parolă · administratori',
  optionalPin: 'Cod PIN personalizat (opțional)',
  generateHint: 'Lasă câmpul gol pentru un cod generat automat; se afișează o singură dată.',
  administrativeRole:
    'Acest rol administrează accesul. Sunt necesare parolă și MFA; codul PIN nu poate fi folosit.',
  managementLogin:
    'Identificator intern pentru administrarea contului. Personalul intră numai cu codul PIN.',
  pinBadge: 'Cod PIN',
  pinConfigured: 'Cod PIN personal configurat',
  passwordBadge: 'Parolă',
  resetPin: 'Generează / resetează cod PIN',
  resetPinConfirm: 'Confirmă noul cod PIN',
  resetPinHint:
    'Codul anterior și sesiunile active vor fi invalidate. Noul cod se afișează o singură dată.',
  passwordTransition:
    'Resetarea parolei schimbă metoda de autentificare în parolă; codul PIN nu va mai funcționa.',
  issuedTitle: 'Cod PIN · afișat o singură dată',
  issuedHint:
    'Transmite codul personal doar titularului. Acesta intră direct, fără login și fără schimbarea unei parole.',
  savedPin: 'Am salvat codul PIN în siguranță',
  promotionHint:
    'Acest cont necesită o parolă nouă și verificare MFA. Folosește resetarea parolei pentru a continua activarea administrativă.',
} as const;
