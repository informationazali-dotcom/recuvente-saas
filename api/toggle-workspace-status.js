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

  const { workspaceId, action } = req.body;
  if (!workspaceId || !["suspendre", "reactiver"].includes(action)) {
    return res.status(400).json({ error: "Paramètres invalides" });
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
