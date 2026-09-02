// Sert les bonnes balises meta (titre, image, description) aux robots qui génèrent les
// aperçus de lien (WhatsApp, Facebook, Twitter/X, LinkedIn...) quand ils visitent un lien
// de boutique ou de produit. Ces robots ne lisent jamais le JavaScript, donc les balises
// posées côté client (dans CataloguePublic.jsx) ne leur sont jamais visibles — cette
// fonction leur sert directement le bon HTML. Le routage vers cette fonction (uniquement
// pour ces robots, jamais pour un vrai visiteur) se fait via vercel.json.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function echapperHTML(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const slug = url.searchParams.get("boutique");
  const catalogueIdDirect = url.searchParams.get("catalogue");
  const produitId = url.searchParams.get("produit");

  try {
    let workspaceId = catalogueIdDirect;

    if (!workspaceId && slug) {
      const { data: idTrouve } = await supabaseAdmin.rpc("workspace_id_par_slug", { p_slug: slug });
      workspaceId = idTrouve;
    }
    if (!workspaceId) return res.redirect(302, "/");

    const { data: lignes } = await supabaseAdmin.rpc("catalogue_public", { p_workspace_id: workspaceId });
    if (!Array.isArray(lignes) || lignes.length === 0) return res.redirect(302, "/");

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

    const lienActuel = url.toString();
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
<meta property="og:url" content="${echapperHTML(lienActuel)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>${echapperHTML(titre)}</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).send(html);
  } catch (e) {
    return res.redirect(302, "/");
  }
}
