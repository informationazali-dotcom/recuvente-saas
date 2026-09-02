 // Détecte les robots qui génèrent les aperçus de lien (WhatsApp, Facebook, Twitter/X, LinkedIn...)
// et leur sert une page HTML minimale avec les bonnes balises meta (titre, image, description)
// du produit ou de la boutique précis — au lieu de la page générique, puisque ces robots
// ne lisent jamais le JavaScript et ne verraient donc jamais les balises posées côté client.
// Les vrais visiteurs (navigateurs) ne sont jamais concernés : ils reçoivent l'app normale.

export const config = {
  matcher: "/",
};

const CRAWLER_REGEX = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest/i;

function echapperHTML(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function middleware(request) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!CRAWLER_REGEX.test(userAgent)) {
    return; // Pas un robot connu, on laisse passer l'app normale.
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("boutique");
  const catalogueIdDirect = url.searchParams.get("catalogue");
  const produitId = url.searchParams.get("produit");

  if (!slug && !catalogueIdDirect) {
    return; // Page d'accueil générale (landing), rien de spécifique à injecter.
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

  try {
    let workspaceId = catalogueIdDirect;

    if (!workspaceId && slug) {
      const respSlug = await fetch(`${SUPABASE_URL}/rest/v1/rpc/workspace_id_par_slug`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_slug: slug }),
      });
      workspaceId = await respSlug.json();
    }
    if (!workspaceId) return;

    const respCatalogue = await fetch(`${SUPABASE_URL}/rest/v1/rpc/catalogue_public`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_workspace_id: workspaceId }),
    });
    const lignes = await respCatalogue.json();
    if (!Array.isArray(lignes) || lignes.length === 0) return;

    const entreprise = lignes[0];
    let titre, description, image, type;

    if (produitId) {
      const produit = lignes.find((r) => r.produit_id === produitId);
      if (produit) {
        titre = `${produit.produit_nom} — ${entreprise.entreprise_nom}`;
        description = (produit.produit_description || entreprise.description_boutique || "").replace(/<[^>]*>/g, "").slice(0, 160);
        image = produit.photo_url;
        type = "product";
      }
    }
    if (!titre) {
      titre = entreprise.entreprise_nom;
      description = (entreprise.description_boutique || `Découvrez les produits de ${entreprise.entreprise_nom}, paiement à la livraison.`).slice(0, 160);
      image = entreprise.logo_url;
      type = "website";
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${echapperHTML(titre)}</title>
<meta name="description" content="${echapperHTML(description)}">
<meta property="og:title" content="${echapperHTML(titre)}">
<meta property="og:description" content="${echapperHTML(description)}">
${image ? `<meta property="og:image" content="${echapperHTML(image)}">` : ""}
<meta property="og:type" content="${type}">
<meta property="og:url" content="${echapperHTML(url.toString())}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>${echapperHTML(titre)}</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return; // En cas d'erreur, on laisse passer l'app normale plutôt que de casser le site.
  }
}
