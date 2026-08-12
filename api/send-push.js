 import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  "mailto:contact@recuvente.app",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  // Sécurité simple : seul le webhook Supabase (avec le bon secret) peut appeler ceci
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const commande = req.body.record;
  if (!commande || !commande.workspace_id) return res.status(400).json({ error: "Pas de commande fournie" });

  // Sécurité multi-tenant : uniquement les abonnements de CE workspace précis
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("*")
    .eq("workspace_id", commande.workspace_id);

  if (error) return res.status(500).json({ error: error.message });
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0 });

  const { data: ws } = await supabaseAdmin.from("workspaces").select("name").eq("id", commande.workspace_id).single();
  const nomEntreprise = ws?.name || "RecuVente";

  const payload = JSON.stringify({
    title: `🔔 Nouvelle commande — ${nomEntreprise}`,
    body: `${commande.client} — ${commande.produit} (${Number(commande.montant).toLocaleString("fr-FR")})`,
    url: "/",
  });

  let sent = 0;
  let expired = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
          expired++;
        }
      }
    })
  );

  return res.status(200).json({ sent, expired, total: subs.length });
}
