 import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const workspaceId = req.query.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId manquant" });

  // Vérifie que la personne appartient vraiment à ce workspace
  const { data: membre } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membre || membre.role !== "owner") {
    return res.status(403).json({ error: "Seul le propriétaire peut exporter les données" });
  }

  const { data: workspace } = await supabaseAdmin.from("workspaces").select("name").eq("id", workspaceId).single();

  const tables = ["commandes", "livreurs", "closers", "produits"];
  const backup = { workspace: workspace?.name, exported_at: new Date().toISOString() };

  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select("*").eq("workspace_id", workspaceId);
    backup[table] = error ? { error: error.message } : data;
  }

  const { data: commandeIds } = await supabaseAdmin.from("commandes").select("id").eq("workspace_id", workspaceId);
  const ids = (commandeIds || []).map((c) => c.id);
  if (ids.length > 0) {
    const { data: relances } = await supabaseAdmin.from("relances").select("*").in("commande_id", ids);
    backup.relances = relances || [];
  } else {
    backup.relances = [];
  }

  res.setHeader("Content-Disposition", `attachment; filename="${(workspace?.name || "recuvente").replace(/[^a-z0-9]/gi, "-")}-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(backup);
}
