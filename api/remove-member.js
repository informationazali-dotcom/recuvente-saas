  import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { workspaceId, memberUserId } = req.body;
  if (!workspaceId || !memberUserId) return res.status(400).json({ error: "Champs manquants" });

  // Vérifie que l'appelant est bien le propriétaire de ce workspace
  const { data: ws, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  if (wsError || !ws || ws.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "Seul le propriétaire peut retirer un membre" });
  }

  // Un propriétaire ne peut jamais se retirer lui-même de son propre espace
  if (memberUserId === ws.owner_id) {
    return res.status(400).json({ error: "Impossible de retirer le propriétaire de son propre espace" });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId);

  if (deleteError) return res.status(400).json({ error: deleteError.message });

  return res.status(200).json({ success: true });
}
