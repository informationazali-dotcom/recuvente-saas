import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Autorise le vrai propriétaire, OU un membre avec le rôle "rh"
// (le rôle RH ne peut cependant pas créer d'autres comptes admin/rh — voir plus bas)
async function peutGererEquipe(workspaceId, userId) {
  const { data: ws, error } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (error || !ws) return null;
  if (ws.owner_id === userId) return { ws, viaRole: "owner" };

  const { data: membre } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membre && membre.role === "rh") return { ws, viaRole: "rh" };
  return false;
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
      .select("id, user_id, role, titre, created_at")
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
    const { email, password, role, titre } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: "Champs manquants" });

    const autorisation = await peutGererEquipe(workspaceId, userData.user.id);
    if (!autorisation) return res.status(403).json({ error: "Seul le propriétaire ou une personne RH peut inviter des membres" });

    // Le rôle RH ne peut pas créer de comptes admin ou rh (pas d'auto-élévation de privilèges)
    if (autorisation.viaRole === "rh" && (role === "admin" || role === "rh")) {
      return res.status(403).json({ error: "Le rôle RH ne peut inviter que des Closers, Livreurs ou Comptables. Seul le propriétaire peut créer un Admin ou un autre RH." });
    }

    const ws = autorisation.ws;

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
      { workspace_id: workspaceId, user_id: userId, role, titre: titre || null },
    ]);

    if (memberError) return res.status(400).json({ error: memberError.message });

    return res.status(200).json({ success: true, email, compteExistant: !!createError });
  }

  // ===== RETIRER =====
  if (action === "remove") {
    const { memberUserId } = req.body;
    if (!memberUserId) return res.status(400).json({ error: "memberUserId manquant" });

    const autorisation = await peutGererEquipe(workspaceId, userData.user.id);
    if (!autorisation) return res.status(403).json({ error: "Seul le propriétaire ou une personne RH peut retirer un membre" });

    const ws = autorisation.ws;

    if (memberUserId === ws.owner_id) {
      return res.status(400).json({ error: "Impossible de retirer le propriétaire de son propre espace" });
    }

    // Le rôle RH ne peut pas retirer un admin ou un autre RH (protège contre les abus)
    if (autorisation.viaRole === "rh") {
      const { data: cible } = await supabaseAdmin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", memberUserId)
        .maybeSingle();
      if (cible && (cible.role === "admin" || cible.role === "rh")) {
        return res.status(403).json({ error: "Le rôle RH ne peut pas retirer un Admin ou un autre RH." });
      }
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
