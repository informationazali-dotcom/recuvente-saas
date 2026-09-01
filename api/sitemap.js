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

export default async function handler(req, res) {
  const origine = `https://${req.headers.host}`;

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
