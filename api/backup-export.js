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
    return res.status(403).json({ error: "Accès réservé à l'administrateur RecuVente" });
  }

  const tables = ["workspaces", "workspace_members", "commandes", "livreurs", "closers", "produits", "relances", "subscriptions", "upgrade_requests"];
  const backup = { exported_at: new Date().toISOString() };

  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select("*");
    backup[table] = error ? { error: error.message } : data;
  }

  res.setHeader("Content-Disposition", `attachment; filename="recuvente-saas-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(backup);
}
