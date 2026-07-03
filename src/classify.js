import { TAXONOMY, DEFAULT_SUB, isValid } from './taxonomy.js';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Gender detection from any text (feed category path, product name…).
function detectGender(text) {
  const t = norm(text);
  if (/\b(femme|women|woman|female|dame|girl|fille)\b/.test(t)) return 'femme';
  if (/\b(homme|men|man|male|garcon|boy)\b/.test(t)) return 'homme';
  return null;
}

// Ordered keyword rules → (category, sub). First match wins, so put specific
// subcategories before generic ones. Slugs are gender-agnostic here; validity
// against the gender is checked afterwards with a safe fallback.
const RULES = [
  // Chaussures
  [/sneaker|basket|running|trainer|air max|jordan/, 'chaussures', 'sneakers'],
  [/talon|escarpin|high heel|stiletto/, 'chaussures', 'talons'],
  [/botte|boot|bottine|chelsea/, 'chaussures', 'bottes-et-bottines'],
  [/ballerine|ballet flat/, 'chaussures', 'ballerines'],
  [/mocassin|loafer|derbies?|richelieu/, 'chaussures', 'mocassins'],
  [/sandale|claquette|tong|slide|mule/, 'chaussures', 'sandales'],
  [/espadrille/, 'chaussures', 'espadrilles'],
  [/chaussure|shoe|soulier/, 'chaussures', null],
  // Accessoires
  [/sac|bag|pochette|sacoche|cabas|besace/, 'accessoires', 'sacs'],
  [/montre|watch/, 'accessoires', 'montres'],
  [/lunette|sunglass|solaire/, 'accessoires', 'lunettes-de-soleil'],
  [/casquette|chapeau|bonnet|cap|hat|beanie/, 'accessoires', 'chapeaux-et-casquettes'],
  [/ceinture|belt/, 'accessoires', 'ceintures'],
  [/bijou|collier|bracelet|bague|jewel|necklace|earring|boucle d'oreille/, 'accessoires', 'bijoux'],
  [/echarpe|gant|scarf|glove|mitaine/, 'accessoires', 'echarpes-et-gants'],
  [/portefeuille|wallet|porte-carte/, 'accessoires', 'portefeuilles'],
  // Beauté
  [/parfum|fragrance|eau de (toilette|parfum)|cologne/, 'beaute', 'parfums'],
  [/maquillage|makeup|rouge a levres|lipstick|mascara|fond de teint/, 'beaute', 'maquillage'],
  [/soin visage|creme visage|serum|face care/, 'beaute', 'soins-visage'],
  [/shampoing|soin cheveux|hair care|apres-shampoing/, 'beaute', 'soins-cheveux'],
  [/rasage|barbe|shaving|beard/, 'beaute', 'rasage-et-barbe'],
  [/soin corps|body care|gel douche|lait corps/, 'beaute', 'soins-corps'],
  // Sport
  [/sport|training|gym|fitness|jogging|legging de sport/, 'sport', 'vetements-de-sport'],
  // Vêtements
  [/robe|dress/, 'vetements', 'robes'],
  [/jean|denim/, 'vetements', 'jeans'],
  [/hoodie|sweat|sweatshirt/, 'vetements', 'sweats-et-hoodies'],
  [/pull|maille|knit|sweater|cardigan/, 'vetements', 'pulls-et-maille'],
  [/veste|manteau|blouson|jacket|coat|parka|doudoune|trench/, 'vetements', 'vestes-et-manteaux'],
  [/chemise|blouse|shirt(?! ?t)/, 'vetements', 'chemises'],
  [/t-?shirt|tee|debardeur|top|haut/, 'vetements', 't-shirts-et-debardeurs'],
  [/costume|suit|blazer/, 'vetements', 'costumes'],
  [/short|bermuda/, 'vetements', 'shorts'],
  [/jupe|skirt/, 'vetements', 'jupes'],
  [/combinaison|jumpsuit|combishort/, 'vetements', 'combinaisons'],
  [/maillot de bain|swimsuit|bikini/, 'vetements', 'maillots-de-bain'],
  [/lingerie|pyjama|sous-vetement|underwear|culotte|soutien/, 'vetements', 'lingerie-et-pyjamas'],
  [/pantalon|chino|trouser|legging/, 'vetements', 'pantalons-et-chinos'],
];

// Maps a scraped/feed product to a valid Drip (gender, category, sub) triple.
// Returns null if it can't confidently place it (caller skips the item).
export function classify({ title = '', categoryHint = '', genderHint = '' }) {
  const gender = detectGender(genderHint) || detectGender(categoryHint) || detectGender(title) || 'homme';
  const hay = norm(`${categoryHint} ${title}`);

  let category = null;
  let sub = null;
  for (const [re, cat, s] of RULES) {
    if (re.test(hay)) {
      category = cat;
      sub = s;
      break;
    }
  }
  if (!category) return null; // couldn't identify a product type → skip

  // Reconcile the chosen sub with the gender; fall back safely if needed.
  if (!sub) sub = DEFAULT_SUB[gender][category];
  if (!isValid(gender, category, sub)) {
    // e.g. a sub that only exists for the other gender → normalize to that gender
    const otherGender = gender === 'homme' ? 'femme' : 'homme';
    if (isValid(otherGender, category, sub)) return { gender: otherGender, category, sub };
    sub = DEFAULT_SUB[gender][category];
  }
  if (!isValid(gender, category, sub)) return null;
  return { gender, category, sub };
}
