export const orderCreationMessages = {
  invalidResolution: 'Răspunsul verificării nu confirmă cererea. Reîncearcă verificarea.',
  recovery:
    'Există o cerere de creare cu rezultat necunoscut. Verifică rezultatul înainte de o comandă nouă.',
  resolve: 'Verifică rezultatul creării',
  retired: 'Cererea anterioară a fost retrasă definitiv. Poți modifica și salva o comandă nouă.',
  storageError:
    'Nu putem păstra cheia cererii în această filă. Crearea este blocată pentru a evita duplicatele.',
  storageConflict:
    'Există o altă cerere de creare nerezolvată în această filă. Reîncarcă pagina pentru verificare.',
  invalidPointer: 'Cheia locală de recuperare nu este validă. Crearea rămâne blocată.',
} as const;
