 import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VERCEL_PROJECT = "recuvente-saas"; // nom exact du projet sur Vercel

export default async function handler(req, res) {
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
