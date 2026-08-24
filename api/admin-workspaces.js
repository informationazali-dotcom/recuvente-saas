import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RECUVENTE_ADMIN_EMAIL = process.env.RECUVENTE_ADMIN_EMAIL;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  if (!RECUVENTE_ADMIN_EMAIL || userData.user.email.trim().toLowerCase() !== RECUVENTE_ADMIN_EMAIL.trim().toLowerCase()) {
    return res.status(403).json({
      error: "Accès réservé à l'administrateur RecuVente",
      debug: `Connecté avec: "${userData.user.email}" — Admin attendu: "${RECUVENTE_ADMIN_EMAIL || "(non configuré)"}"`,
    });
  }

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
