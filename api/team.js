 import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifierProprietaire(workspaceId, userId) {
  const { data: ws, error } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (error || !ws) return null;
  return ws.owner_id === userId ? ws : false;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  // ===== LISTER (GET) =====
  if (req.method === "GET") {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "workspaceId manquant" });

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

  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { action, workspaceId } = req.body;
  if (!action || !workspaceId) return res.status(400).json({ error: "Champs manquants" });

  // ===== INVITER =====
  if (action === "invite") {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: "Champs manquants" });

    const ws = await verifierProprietaire(workspaceId, userData.user.id);
    if (!ws) return res.status(403).json({ error: "Seul le propriétaire peut inviter des membres" });

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId;

    if (createError) {
      const dejaExistant = (createError.message || "").toLowerCase().includes("already") || createError.status === 422;
      if (!dejaExistant) return res.status(400).json({ error: createError.message });

      const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) return res.status(400).json({ error: listError.message });

      const utilisateurExistant = usersList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!utilisateurExistant) return res.status(400).json({ error: "Impossible de retrouver ce compte existant." });

      userId = utilisateurExistant.id;

      const { data: dejaMembre } = await supabaseAdmin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (dejaMembre) return res.status(400).json({ error: "Cette personne est déjà membre de ton espace." });
    } else {
      userId = newUser.user.id;
    }

    const { error: memberError } = await supabaseAdmin.from("workspace_members").insert([
      { workspace_id: workspaceId, user_id: userId, role },
    ]);

    if (memberError) return res.status(400).json({ error: memberError.message });

    return res.status(200).json({ success: true, email, compteExistant: !!createError });
  }

  // ===== RETIRER =====
  if (action === "remove") {
    const { memberUserId } = req.body;
    if (!memberUserId) return res.status(400).json({ error: "memberUserId manquant" });

    const ws = await verifierProprietaire(workspaceId, userData.user.id);
    if (!ws) return res.status(403).json({ error: "Seul le propriétaire peut retirer un membre" });

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

  return res.status(400).json({ error: "Action inconnue" });
}
