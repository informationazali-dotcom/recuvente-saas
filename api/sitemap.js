import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function echapperXML(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ===== Flux produits (canal de vente) — format RSS/Google Shopping, compatible Meta Catalog
// ET Google Merchant Center. Le marchand ajoute lui-même cette URL dans son Meta Commerce
// Manager ("flux programmé") ou Google Merchant Center — aucune connexion OAuth ni validation
// Meta nécessaire de notre côté, contrairement aux publicités.
async function genererFluxProduits(req, res, workspaceId, origine) {
  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, slug, nom, currency, store_is_published")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace || !workspace.store_is_published) {
    res.setHeader("Content-Type", "application/xml");
    res.status(404).send(`<?xml version="1.0" encoding="UTF-8"?><erreur>Boutique introuvable ou non publiée.</erreur>`);
    return;
  }

  const { data: produits } = await supabaseAdmin
    .from("produits")
    .select("id, nom, description, prix_vente, stock, photo, photo_url")
    .eq("workspace_id", workspaceId)
    .not("prix_vente", "is", null)
    .gt("prix_vente", 0);

  const devise = workspace.currency === "XOF" || workspace.currency === "XAF" ? "XOF" : (workspace.currency || "XOF");

  const items = (produits || []).map((p) => {
    const lien = `${origine}/?catalogue=${encodeURIComponent(workspaceId)}&produit=${p.id}`;
    const image = p.photo_url || p.photo || "";
    const disponible = Number(p.stock) > 0 ? "in stock" : "out of stock";
    return `  <item>
    <g:id>${echapperXML(p.id)}</g:id>
    <title>${echapperXML(p.nom || "Produit")}</title>
    <description>${echapperXML(p.description || p.nom || "Produit disponible en paiement à la livraison.")}</description>
    <link>${echapperXML(lien)}</link>
    <g:image_link>${echapperXML(image)}</g:image_link>
    <g:availability>${disponible}</g:availability>
    <g:price>${Number(p.prix_vente).toFixed(0)} ${devise}</g:price>
    <g:condition>new</g:condition>
    <g:brand>${echapperXML(workspace.nom || "RecuVente")}</g:brand>
  </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${echapperXML(workspace.nom || "Boutique")}</title>
  <link>${echapperXML(origine)}/?catalogue=${encodeURIComponent(workspaceId)}</link>
  <description>Catalogue produits — ${echapperXML(workspace.nom || "")}</description>
${items}
</channel>
</rss>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
}

export default async function handler(req, res) {
  const origine = `https://${req.headers.host}`;

  // Flux produits pour un marchand précis (canal de vente Facebook/Instagram/Google) —
  // ex: /api/sitemap?flux=abc123 — séparé du plan de site global généré ci-dessous.
  const workspaceIdFlux = req.query?.flux;
  if (workspaceIdFlux) {
    return genererFluxProduits(req, res, workspaceIdFlux, origine);
  }

  // Boutiques avec un slug et un abonnement actif ou en essai valide
  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, slug, store_is_published")
    .not("slug", "is", null)
    .eq("store_is_published", true);

  const urls = [];

  for (const ws of workspaces || []) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, trial_ends_at")
      .eq("workspace_id", ws.id)
      .maybeSingle();

    const actif = sub && (sub.status === "active" || (sub.status === "trial" && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()));
    if (!actif) continue;

    urls.push(`${origine}/?boutique=${encodeURIComponent(ws.slug)}`);

    const { data: produits } = await supabaseAdmin
      .from("produits")
      .select("id, updated_at")
      .eq("workspace_id", ws.id)
      .not("prix_vente", "is", null)
      .gt("prix_vente", 0);

    for (const p of produits || []) {
      urls.push(`${origine}/?boutique=${encodeURIComponent(ws.slug)}&produit=${p.id}`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${echapperXML(u)}</loc></url>`).join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
}
