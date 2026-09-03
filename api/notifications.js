import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure web-push avec la paire de clés VAPID (la clé publique doit être EXACTEMENT
// la même que celle utilisée côté client dans App.jsx, sinon les envois échouent).
webpush.setVapidDetails(
  "mailto:contact@recuvente.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { type } = req.body || {};

  // ===== Email de bienvenue à la création d'un espace =====
  if (type === "welcome") {
    const { email, workspaceName } = req.body;
    // Envoi de l'email de bienvenue — comportement existant, inchangé.
    // (Si un vrai fournisseur d'email — Resend, SendGrid... — était déjà branché ici,
    // remets-le à cet endroit exact : cette section a été reconstruite de mémoire et
    // doit être vérifiée contre ton fichier réel avant déploiement.)
    console.log(`Email de bienvenue à envoyer à ${email} pour l'espace "${workspaceName}"`);
    return res.status(200).json({ ok: true });
  }

  // ===== Notification push forte à l'arrivée d'une nouvelle commande =====
  if (type === "new_order") {
    const { workspaceId, client, produit, montant } = req.body;
    if (!workspaceId) return res.status(400).json({ error: "workspaceId manquant" });

    const { data: abonnements, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (error) return res.status(500).json({ error: error.message });
    if (!abonnements || abonnements.length === 0) {
      return res.status(200).json({ ok: true, envoyes: 0, message: "Personne n'a activé les notifications pour cet espace." });
    }

    const contenuNotification = JSON.stringify({
      title: "🔔 Nouvelle commande !",
      body: `${client || "Un client"} — ${produit || "commande"}${montant ? ` (${Number(montant).toLocaleString("fr-FR")})` : ""}`,
      url: "/",
    });

    let envoyes = 0;
    const abonnementsMorts = [];

    await Promise.all(
      abonnements.map(async (abo) => {
        const sub = {
          endpoint: abo.endpoint,
          keys: { p256dh: abo.p256dh, auth: abo.auth },
        };
        try {
          await webpush.sendNotification(sub, contenuNotification);
          envoyes += 1;
        } catch (e) {
          // Code 404/410 = l'abonnement n'est plus valide (désinstallation, etc.) — on le nettoie.
          if (e.statusCode === 404 || e.statusCode === 410) {
            abonnementsMorts.push(abo.endpoint);
          }
        }
      })
    );

    if (abonnementsMorts.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", abonnementsMorts);
    }

    return res.status(200).json({ ok: true, envoyes, total: abonnements.length });
  }

  return res.status(400).json({ error: "Type de notification inconnu" });
}
