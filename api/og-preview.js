// Sert les bonnes balises meta (titre, image, description) pour un lien de produit ou de
// boutique partagé sur WhatsApp/Facebook/etc. Contrairement à une tentative précédente basée
// sur des règles de réécriture d'URL (peu fiables selon la configuration du projet), cette
// fonction est appelée directement via son propre chemin (/api/og-preview), donc toujours
// atteignable sans configuration supplémentaire. Un vrai visiteur qui clique sur ce lien est
// redirigé automatiquement (en une fraction de seconde) vers la vraie boutique — les robots
// de partage ne suivent jamais cette redirection et lisent directement les bonnes balises.

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
  const slug = req.query.boutique;
  const catalogueIdDirect = req.query.catalogue;
  const produitId = req.query.produit;

  const lienReel = slug
    ? `https://${req.headers.host}/?boutique=${encodeURIComponent(slug)}${produitId ? `&produit=${encodeURIComponent(produitId)}` : ""}`
    : `https://${req.headers.host}/?catalogue=${encodeURIComponent(catalogueIdDirect || "")}${produitId ? `&produit=${encodeURIComponent(produitId)}` : ""}`;

  function pageAvecRedirection(titre, description, image, type) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${echapperHTML(titre)}</title>
<meta name="description" content="${echapperHTML(description)}">
<meta property="og:title" content="${echapperHTML(titre)}">
<meta property="og:description" content="${echapperHTML(description)}">
<meta property="og:image" content="${echapperHTML(image)}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${echapperHTML(lienReel)}">
<meta name="twitter:card" content="summary_large_image">
<script>window.location.replace(${JSON.stringify(lienReel)});</script>
</head>
<body>Redirection vers <a href="${echapperHTML(lienReel)}">${echapperHTML(titre)}</a>...</body>
</html>`;
  }

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
    if (!image) image = `https://${req.headers.host}/favicon.png`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).send(pageAvecRedirection(titre, description, image, type));
  } catch (e) {
    return res.redirect(302, "/");
  }
}
