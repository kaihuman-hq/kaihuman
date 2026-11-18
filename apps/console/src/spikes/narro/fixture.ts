// Fictional sample: examples/company.yaml merged into examples/offer.md by hand (`extends:` in-repo).
export const offerData = {
  template: 'offer',
  locale: 'de-DE',
  currency: 'EUR',
  paper: 'A4',
  letterhead: 'din5008-b',
  logoWidth: '38mm',
  sender: {
    name: 'Narro GmbH',
    address: ['Beispielweg 5', '80331 München'],
    email: 'billing@example.com',
    phone: '+49 89 000000-0',
    website: 'example.com',
    vatId: 'DE999999999',
    taxNumber: '143/123/45678',
    register: 'Amtsgericht München, HRB 123456',
    managingDirectors: ['Max Muster', 'Erika Beispiel'],
  },
  bank: { name: 'Musterbank', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001' },
  theme: { accent: '#4F46E5', font: 'Inter' },
  number: 'AN-2026-0017',
  date: '2026-10-26',
  validUntil: '2026-11-30',
  acceptance: true,
  client: {
    name: 'ACME GmbH',
    contact: 'Erika Mustermann',
    address: ['Musterstraße 1', '10115 Berlin'],
    customerNumber: 'K-1001',
  },
  subject: 'Angebot AN-2026-0017 – Einführung von Narro',
  items: [
    { description: 'Narro Team, Jahreslizenz', qty: 10, unit: 'Platz', price: 39.0, vat: 19 },
    {
      description: 'Migration bestehender Präsentationen',
      details: 'Bis zu 40 Folien je Präsentation, inklusive Abnahme',
      qty: 12,
      unit: 'Std.',
      price: 95.0,
      vat: 19,
    },
    {
      description: 'Schulung für das Präsentationsteam',
      details: 'Ganztägig vor Ort in Berlin, zzgl. Reisekosten',
      qty: 1,
      price: 1200.0,
      vat: 19,
    },
    // enough extra rows to force a second page (page-break + repeating footer check)
    ...Array.from({ length: 26 }, (_, i) => ({
      description: `Zusatzleistung ${i + 1}`,
      details: 'Pauschal nach Aufwand',
      qty: 1,
      price: 100 + i,
      vat: 19,
    })),
  ],
};

export const offerMarkdown = `Sehr geehrte Frau Mustermann,

vielen Dank für Ihr Interesse an Narro. Gerne bieten wir Ihnen die Einführung wie folgt an:

<!-- items -->

Die Lizenzen beginnen mit dem Tag der Auftragserteilung.

Mit freundlichen Grüßen\\
Max Muster
`;
