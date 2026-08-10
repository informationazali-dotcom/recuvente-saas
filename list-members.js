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

  // Vérifie que l'appelant est membre de ce workspace
  const { data: membership } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!membership) return res.status(403).json({ error: "Accès refusé" });

  const { data: members, error } = await supabaseAdmin
    .from("workspace_members")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", workspaceId);

  if (error) return res.status(400).json({ error: error.message });

  const enrichis = await Promise.all(
    members.map(async (m) => {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      return { ...m, email: u?.user?.email || "?" };
    })
  );

  return res.status(200).json({ members: enrichis });
}
