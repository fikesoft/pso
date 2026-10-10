export const customerRfmMessages = {
  title: 'Segmentare RFM',
  hint: 'Calculată exclusiv din comenzile eligibile în acoperirea de mai sus. Segmentele se pot suprapune; nu acordă automat beneficii.',
  recency: 'Zile de la ultima comandă',
  frequency: 'Frecvență (comenzi)',
  monetary: 'Valoare monetară netă',
  scores: 'Scoruri R / F / M (1–5)',
  noHistory: 'Fără istoric eligibil: clientul nu este clasificat.',
  noSegment: 'Nu se încadrează în segmentele definite.',
  policy: 'Reguli RFM v1',
  recencyRule:
    'R: 5 pentru 0–7 zile, 4 pentru 8–30, 3 pentru 31–60, 2 pentru 61–90 și 1 peste 90. Se folosesc zile complete de 24 de ore.',
  frequencyRule:
    'F: 1 pentru o comandă, 2 pentru două, 3 pentru 3–4, 4 pentru 5–9 și 5 pentru cel puțin 10.',
  monetaryRule:
    'M: 1 sub 100, 2 de la 100, 3 de la 500, 4 de la 1.000 și 5 de la 2.500, în moneda sumelor afișate. Rambursările reduc valoarea monetară.',
  segmentRule:
    'VIP: R≥4, F≥4, M≥4. Fidel: R≥3, F≥4. Nou: o comandă în cel mult 30 zile. În risc: 61–90 zile. Pierdut: peste 90 zile. Cheltuieli mari: M≥4. Frecvent: F≥4.',
  segments: {
    VIP: 'VIP',
    LOYAL: 'Fidel',
    NEW: 'Nou',
    AT_RISK: 'În risc',
    LOST: 'Pierdut',
    HIGH_SPENDERS: 'Cheltuieli mari',
    FREQUENT: 'Frecvent',
  },
};
