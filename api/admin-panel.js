import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const RECUVENTE_ADMIN_EMAIL = process.env.RECUVENTE_ADMIN_EMAIL;

async function verifierAdmin(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Non authentifié" });
    return null;
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Session invalide" });
    return null;
  }
  if (!RECUVENTE_ADMIN_EMAIL || userData.user.email.trim().toLowerCase() !== RECUVENTE_ADMIN_EMAIL.trim().toLowerCase()) {
    res.status(403).json({
      error: "Accès réservé à l'administrateur RecuVente",
      debug: `Connecté avec: "${userData.user.email}" — Admin attendu: "${RECUVENTE_ADMIN_EMAIL || "(non configuré)"}"`,
    });
    return null;
  }
  return userData.user;
}

// ===== GET : données du panneau admin (fusion de admin-workspaces.js) =====
async function gererGET(req, res) {
  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, country, currency, owner_id, created_at, whatsapp_number")
    .order("created_at", { ascending: false });
  if (wsError) return res.status(400).json({ error: wsError.message });

  const { data: subscriptions } = await supabaseAdmin
    .from("subscriptions")
    .select("workspace_id, status, trial_ends_at, plan_id, subscription_plans(nom, prix, devise)");
  const { data: allMembers } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id");

  const enrichis = await Promise.all(
    workspaces.map(async (ws) => {
      const sub = subscriptions?.find((s) => s.workspace_id === ws.id) || null;
      const nbMembres = allMembers?.filter((m) => m.workspace_id === ws.id).length || 0;
      const { data: owner } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
      return {
        ...ws,
        ownerEmail: owner?.user?.email || "?",
        whatsappNumber: ws.whatsapp_number || null,
        subscription: sub,
        nbMembres,
      };
    })
  );

  const mrr = enrichis.reduce((sum, ws) => {
    if (ws.subscription?.status === "active" && ws.subscription.subscription_plans) {
      return sum + Number(ws.subscription.subscription_plans.prix);
    }
    return sum;
  }, 0);
  const enEssai = enrichis.filter((w) => w.subscription?.status === "trial").length;
  const actifs = enrichis.filter((w) => w.subscription?.status === "active").length;

  const { data: demandes } = await supabaseAdmin
    .from("upgrade_requests")
    .select("id, workspace_id, plan_id, statut, created_at, subscription_plans(nom, prix, devise)")
    .eq("statut", "en_attente")
    .order("created_at", { ascending: true });
  const demandesEnrichies = (demandes || []).map((d) => ({
    ...d,
    workspaceName: enrichis.find((w) => w.id === d.workspace_id)?.name || "?",
  }));

  return res.status(200).json({ workspaces: enrichis, mrr, enEssai, actifs, total: enrichis.length, demandes: demandesEnrichies });
}

// ===== POST : suspendre / réactiver / supprimer (fusion de toggle-workspace-status.js) =====
async function gererPOST(req, res) {
  const { workspaceId, action } = req.body;
  if (!workspaceId || !["suspendre", "reactiver", "supprimer"].includes(action)) {
    return res.status(400).json({ error: "Paramètres invalides" });
  }

  if (action === "supprimer") {
    const { data: commandesIds } = await supabaseAdmin.from("commandes").select("id").eq("workspace_id", workspaceId);
    const ids = (commandesIds || []).map((c) => c.id);
    if (ids.length > 0) {
      await supabaseAdmin.from("relances").delete().in("commande_id", ids);
    }
    await supabaseAdmin.from("commandes").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("livreurs").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("closers").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("produits").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("push_subscriptions").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("upgrade_requests").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("subscriptions").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("workspace_members").delete().eq("workspace_id", workspaceId);
    const { error: deleteError } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });
    return res.status(200).json({ success: true, supprime: true });
  }

  const nouveauStatut = action === "suspendre" ? "suspended" : "active";
  const { data: existant } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (existant) {
    await supabaseAdmin.from("subscriptions").update({ status: nouveauStatut }).eq("workspace_id", workspaceId);
  } else {
    await supabaseAdmin.from("subscriptions").insert([{ workspace_id: workspaceId, status: nouveauStatut }]);
  }
  return res.status(200).json({ success: true, status: nouveauStatut });
}

export default async function handler(req, res) {
  const user = await verifierAdmin(req, res);
  if (!user) return; // verifierAdmin a déjà renvoyé la bonne erreur

  if (req.method === "POST") return gererPOST(req, res);
  return gererGET(req, res);
}
