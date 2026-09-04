import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VERCEL_PROJECT = "recuvente-saas"; // nom exact du projet sur Vercel

export default async function handler(req, res) {
  // ===== FLUX PRODUITS (Facebook/Google Shopping) =====
  // Fusionné ici pour ne pas dépasser la limite de fonctions du plan Vercel Hobby.
  // Appel : GET /api/domains?feed=1&workspace=WORKSPACE_ID
  if (req.method === "GET" && req.query.feed) {
    const workspaceId = req.query.workspace;
    if (!workspaceId) return res.status(400).send("Paramètre workspace manquant.");

    const { data: produits, error } = await supabaseAdmin.rpc("flux_produits_public", {
      p_workspace_id: workspaceId,
    });

    if (error) return res.status(500).send("Erreur lors du chargement des produits : " + error.message);
    if (!produits || produits.length === 0) return res.status(404).send("Aucun produit trouvé pour cette boutique.");

    const echapper = (texte) =>
      String(texte || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const nomBoutique = echapper(produits[0].nom_boutique || "Ma boutique");
    const slug = produits[0].slug;
    const urlBoutique = slug ? `https://recuvente-saas.vercel.app/?boutique=${slug}` : `https://recuvente-saas.vercel.app/?catalogue=${workspaceId}`;

    const items = produits
      .map((p) => {
        const urlProduit = `${urlBoutique}&produit=${p.produit_id}`;
        return `
    <item>
      <g:id>${p.produit_id}</g:id>
      <title>${echapper(p.produit_nom)}</title>
      <description>${echapper(p.description || p.produit_nom)}</description>
      <link>${echapper(urlProduit)}</link>
      <g:image_link>${echapper(p.photo_url)}</g:image_link>
      <g:availability>${p.en_stock ? "in stock" : "out of stock"}</g:availability>
      <g:price>${Number(p.prix_vente).toFixed(2)} ${p.devise}</g:price>
      <g:brand>${nomBoutique}</g:brand>
      <g:condition>new</g:condition>
    </item>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${nomBoutique}</title>
  <link>${echapper(urlBoutique)}</link>
  <description>Catalogue produits de ${nomBoutique}</description>${items}
</channel>
</rss>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(xml);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { workspaceId, domaine, action } = req.body;
  if (!workspaceId || !domaine) return res.status(400).json({ error: "Champs manquants" });

  // Seul le propriétaire de l'espace peut gérer son propre domaine
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (!ws || ws.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "Seul le propriétaire de cet espace peut gérer son domaine" });
  }

  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!vercelToken) return res.status(500).json({ error: "Configuration serveur incomplète (VERCEL_API_TOKEN manquant)" });

  const domainePropre = domaine.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

  // ===== RETIRER =====
  if (action === "remove") {
    const resp = await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/domains/${domainePropre}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!resp.ok && resp.status !== 404) {
      const err = await resp.json().catch(() => ({}));
      return res.status(400).json({ error: err?.error?.message || "Erreur lors du retrait du domaine sur Vercel" });
    }
    return res.status(200).json({ success: true });
  }

  // ===== AJOUTER =====
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/domains`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domainePropre }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Vercel renvoie un message clair, on le relaie tel quel
    return res.status(400).json({ error: data?.error?.message || "Erreur lors de l'ajout du domaine sur Vercel" });
  }

  // Vercel indique quels enregistrements DNS le client doit ajouter chez SON registrar.
  // On relaie cette info telle quelle, sans l'inventer.
  const verification = data.verification || [];
  const configureA = !domainePropre.includes(".") ? [] : [{ type: "A", name: "@", value: "76.76.21.21" }];

  return res.status(200).json({
    success: true,
    domaine: domainePropre,
    verified: data.verified === true,
    instructions: {
      cname: { type: "CNAME", name: domainePropre.split(".").length > 2 ? domainePropre.split(".")[0] : "www", value: "cname.vercel-dns.com" },
      a: configureA[0] || null,
      verification,
    },
  });
}
