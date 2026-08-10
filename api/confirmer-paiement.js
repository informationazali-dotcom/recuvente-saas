import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RECUVENTE_ADMIN_EMAIL = process.env.RECUVENTE_ADMIN_EMAIL;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  if (!RECUVENTE_ADMIN_EMAIL || userData.user.email.trim().toLowerCase() !== RECUVENTE_ADMIN_EMAIL.trim().toLowerCase()) {
    return res.status(403).json({ error: "Accès réservé à l'administrateur RecuVente" });
  }

  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: "requestId manquant" });

  const { data: requete, error: reqError } = await supabaseAdmin
    .from("upgrade_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (reqError || !requete) return res.status(404).json({ error: "Demande introuvable" });

  // Marque la demande comme confirmée
  await supabaseAdmin
    .from("upgrade_requests")
    .update({ statut: "confirmee", confirmed_at: new Date().toISOString() })
    .eq("id", requestId);

  // Active (ou crée) l'abonnement du workspace concerné
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { data: existant } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", requete.workspace_id)
    .maybeSingle();

  if (existant) {
    await supabaseAdmin
      .from("subscriptions")
      .update({ plan_id: requete.plan_id, status: "active", current_period_end: periodEnd.toISOString() })
      .eq("workspace_id", requete.workspace_id);
  } else {
    await supabaseAdmin.from("subscriptions").insert([
      { workspace_id: requete.workspace_id, plan_id: requete.plan_id, status: "active", current_period_end: periodEnd.toISOString() },
    ]);
  }

  return res.status(200).json({ success: true });
}
