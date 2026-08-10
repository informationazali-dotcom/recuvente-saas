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

  const { workspaceId, email, password, role } = req.body;
  if (!workspaceId || !email || !password || !role) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  // Vérifie que l'appelant est bien le propriétaire de ce workspace
  const { data: ws, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  if (wsError || !ws || ws.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "Seul le propriétaire peut inviter des membres" });
  }

  // Crée le compte utilisateur
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) return res.status(400).json({ error: createError.message });

  // L'ajoute au workspace avec le rôle choisi
  const { error: memberError } = await supabaseAdmin.from("workspace_members").insert([
    { workspace_id: workspaceId, user_id: newUser.user.id, role },
  ]);

  if (memberError) return res.status(400).json({ error: memberError.message });

  return res.status(200).json({ success: true, email });
}
