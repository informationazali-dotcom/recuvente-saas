// Sert les bonnes balises meta (titre, image, description) pour un lien de produit ou de
// boutique — à tout le monde, robots ET vrais visiteurs. On récupère la vraie page de
// l'app (index.html), on y injecte les bonnes balises meta dans le <head>, et on la
// renvoie telle quelle : les robots (WhatsApp/Facebook) voient enfin les bonnes balises
// (ils ne lisent jamais le JavaScript), et les vrais visiteurs reçoivent la même page
// fonctionnelle qu'avant (le contenu et les scripts ne sont jamais touchés).

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
  const hote = req.headers.host;
  const url = new URL(req.url, `https://${hote}`);
  const slug = url.searchParams.get("boutique");
  const catalogueIdDirect = url.searchParams.get("catalogue");
  const produitId = url.searchParams.get("produit");

  // Récupère la vraie page de l'app (le vrai fichier construit par Vite), jamais celle
  // réécrite par ce middleware — on demande explicitement /index.html, pas "/".
  async function recupererPageOriginale() {
    const resp = await fetch(`https://${hote}/index.html`);
    return await resp.text();
  }

  try {
    let workspaceId = catalogueIdDirect;

    if (!workspaceId && slug) {
      const { data: idTrouve } = await supabaseAdmin.rpc("workspace_id_par_slug", { p_slug: slug });
      workspaceId = idTrouve;
    }
    if (!workspaceId) {
      const page = await recupererPageOriginale();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(page);
    }

    const { data: lignes } = await supabaseAdmin.rpc("catalogue_public", { p_workspace_id: workspaceId });
    const page = await recupererPageOriginale();

    if (!Array.isArray(lignes) || lignes.length === 0) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(page);
    }

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
    const balisesMeta = `
<title>${echapperHTML(titre)}</title>
<meta name="description" content="${echapperHTML(description)}">
<meta property="og:title" content="${echapperHTML(titre)}">
<meta property="og:description" content="${echapperHTML(description)}">
${image ? `<meta property="og:image" content="${echapperHTML(image)}">` : ""}
<meta property="og:type" content="${type}">
<meta property="og:url" content="${echapperHTML(lienActuel)}">
<meta name="twitter:card" content="summary_large_image">
</head>`;

    // Remplace la balise </head> de la page originale par nos balises + la fermeture,
    // pour insérer nos infos sans toucher au reste de la page (scripts, styles, etc.).
    const pageModifiee = page.replace("</head>", balisesMeta);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).send(pageModifiee);
  } catch (e) {
    const page = await recupererPageOriginale().catch(() => "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(page);
  }
}
