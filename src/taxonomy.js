// Drip taxonomy (mirror of supabase migrations 0006 + 0008). The ingest endpoint
// rejects any (gender, category, sub) triple that isn't valid, so the classifier
// must only ever emit slugs listed here.

export const TAXONOMY = {
  homme: {
    vetements: [
      't-shirts-et-debardeurs', 'chemises', 'sweats-et-hoodies', 'pulls-et-maille',
      'vestes-et-manteaux', 'jeans', 'pantalons-et-chinos', 'shorts', 'costumes',
      'survetements', 'sous-vetements-et-pyjamas',
    ],
    chaussures: ['sneakers', 'chaussures-habillees', 'mocassins', 'bottes-et-bottines', 'sandales', 'espadrilles'],
    accessoires: ['sacs', 'bijoux', 'lunettes-de-soleil', 'chapeaux-et-casquettes', 'ceintures', 'montres', 'echarpes-et-gants', 'portefeuilles'],
    sport: ['vetements-de-sport', 'chaussures-de-sport', 'accessoires-de-sport'],
    beaute: ['parfums', 'soins-visage', 'soins-cheveux', 'rasage-et-barbe'],
  },
  femme: {
    vetements: [
      'robes', 'hauts-et-t-shirts', 'chemises-et-blouses', 'pulls-et-maille',
      'sweats-et-hoodies', 'vestes-et-manteaux', 'jeans', 'pantalons-et-leggings',
      'jupes', 'shorts', 'combinaisons', 'lingerie-et-pyjamas', 'maillots-de-bain',
    ],
    chaussures: ['sneakers', 'talons', 'bottes-et-bottines', 'ballerines', 'mocassins', 'sandales', 'mules'],
    accessoires: ['sacs', 'bijoux', 'lunettes-de-soleil', 'chapeaux-et-casquettes', 'ceintures', 'montres', 'echarpes-et-gants', 'accessoires-cheveux'],
    sport: ['vetements-de-sport', 'chaussures-de-sport', 'accessoires-de-sport'],
    beaute: ['parfums', 'maquillage', 'soins-visage', 'soins-cheveux', 'soins-corps'],
  },
};

// Safe fallback sub for each (gender, category) — used when a keyword matched the
// category but no specific sub could be determined.
export const DEFAULT_SUB = {
  homme: { vetements: 't-shirts-et-debardeurs', chaussures: 'sneakers', accessoires: 'sacs', sport: 'vetements-de-sport', beaute: 'parfums' },
  femme: { vetements: 'hauts-et-t-shirts', chaussures: 'sneakers', accessoires: 'sacs', sport: 'vetements-de-sport', beaute: 'parfums' },
};

export function isValid(gender, category, sub) {
  return !!TAXONOMY[gender]?.[category]?.includes(sub);
}
