 import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

function echapperHtml(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  const { catalogue, produit } = req.query;

  if (!catalogue || !produit) {
    res.setHeader("Location", "/");
    return res.status(302).end();
  }

  const urlFinale = `/?catalogue=${catalogue}&produit=${produit}`;

  try {
    const { data } = await supabaseAdmin.rpc("catalogue_public", { p_workspace_id: catalogue });
    const ligne = (data || []).find((p) => p.produit_id === produit);

    if (!ligne) {
      res.setHeader("Location", urlFinale);
      return res.status(302).end();
    }

    const titre = echapperHtml(ligne.produit_nom);
    const prix = `${Number(ligne.prix_vente).toLocaleString("fr-FR")} ${ligne.devise || "XOF"}`;
    const nomBoutique = echapperHtml(ligne.entreprise_nom);
    const description = echapperHtml(
      (ligne.produit_description || "").replace(/<[^>]*>/g, " ").trim().slice(0, 150) || `Disponible chez ${nomBoutique}`
    );
    const image = ligne.photo_url || "";

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${titre} — ${prix}</title>
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${titre} — ${prix}" />
  <meta property="og:description" content="${description}" />
  ${image ? `<meta property="og:image" content="${echapperHtml(image)}" />` : ""}
  <meta property="og:site_name" content="${nomBoutique}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0; url=${urlFinale}" />
  <script>window.location.replace(${JSON.stringify(urlFinale)});</script>
</head>
<body>
  <p>Redirection vers ${titre}... <a href="${urlFinale}">Cliquez ici si rien ne se passe</a>.</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(html);
  } catch (e) {
    res.setHeader("Location", urlFinale);
    return res.status(302).end();
  }
}
