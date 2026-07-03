# drip-bot

Bot d'ingestion pour **Drip** (https://drip-fr.netlify.app). Il tourne sur un
planificateur (GitHub Actions cron), récupère des bons plans mode depuis **les flux
d'affiliation Awin** et via un **scraper générique** (données produit schema.org des
pages que tu configures), puis les poste sur Drip via `POST /api/ingest/deals`.

> Le site Drip est le **quai de réception** (endpoint + config admin). Ce dépôt est
> le **camion** : c'est lui qui va chercher les deals et les livre. Sans ce bot en
> route, la liste de sites que tu remplis dans l'admin n'est lue par personne.

## Comment ça marche

1. Le bot lit sa config sur `GET /api/ingest/deals` (authentifié par `INGEST_API_KEY`) :
   `enabled`, `autoPublish`, et la **liste des sites** que tu gères dans l'admin Drip.
2. Si le bot est désactivé depuis l'admin → il s'arrête (rien n'est posté).
3. Il rassemble des deals depuis deux sources :
   - **Awin** (`src/sources/awin.js`) : télécharge tes flux produits, ne garde que les
     articles en stock avec une vraie réduction, prend les mieux réduits. Fiable et
     légal, et le lien porte ton tracking d'affiliation.
   - **Scraper générique** (`src/sources/jsonld.js`) : pour chaque URL de ta liste,
     lit les données `schema.org/Product` (JSON-LD) embarquées dans la page. Couvre
     beaucoup de sites sans code par site — mais ne fonctionne pas sur les sites à
     forte protection anti-bot ou dont le prix n'est affiché qu'en JavaScript.
4. Chaque produit est classé automatiquement dans la taxonomie Drip
   (`src/classify.js` : genre → catégorie → sous-catégorie, par mots-clés).
5. Il envoie chaque deal au `POST`. Le serveur applique `autoPublish` (publication
   directe ou file de modération) et **ignore les doublons** (même lien marchand déjà
   posté et non expiré) — le bot peut donc tourner en boucle sans reposter.

## Config (secrets)

| Variable | Rôle |
|---|---|
| `INGEST_API_KEY` | **Doit être identique** à la variable `INGEST_API_KEY` de Netlify. C'est la clé du cadenas. |
| `AWIN_FEED_URLS` | URLs de flux Awin séparées par des virgules (voir ci-dessous). Vide = source Awin ignorée. |
| `DRIP_BASE_URL` | `https://drip-fr.netlify.app` (défaut). |
| `AWIN_PER_FEED` / `MAX_PER_RUN` | Plafonds (défaut 5 / 20). |

### Générer un flux Awin
Dans le tableau de bord Awin : **Toolbox → Create-a-Feed**, choisis le·s marchand·s,
format **CSV**, compression **gzip**, et inclus au minimum ces colonnes :
`product_name, description, brand_name, search_price, store_price, rrp_price,
currency, merchant_deep_link, aw_deep_link, aw_image_url, merchant_category,
in_stock`. Copie l'URL de téléchargement générée dans `AWIN_FEED_URLS`.

## Lancer

```bash
npm install
cp .env.example .env      # renseigne INGEST_API_KEY (+ AWIN_FEED_URLS si dispo)
npm run dry               # simulation : liste ce qui serait posté, sans rien envoyer
npm start                 # exécution réelle
```

## Déploiement (GitHub Actions)

`.github/workflows/bot.yml` exécute le bot toutes les 3 h (et sur déclenchement
manuel). Après avoir poussé ce dépôt sur GitHub :
1. **Settings → Secrets and variables → Actions** → ajoute `INGEST_API_KEY` (et
   `AWIN_FEED_URLS` si tu as Awin).
2. Onglet **Actions** → workflow *drip-bot* → **Run workflow** pour un test manuel.

## Limites (à connaître)

- **Awin** ne renvoie de vrais deals qu'une fois ton compte Awin approuvé et un flux
  généré. Sans ça, seule la source scraper fonctionne.
- Le **scraper générique** dépend des données structurées de chaque site ; certains
  gros sites les masquent ou bloquent les robots. « Scanner des milliers de sites »
  reste un effort continu : chaque source récalcitrante peut demander un adaptateur
  dédié dans `src/sources/`. L'architecture est faite pour en ajouter facilement.
