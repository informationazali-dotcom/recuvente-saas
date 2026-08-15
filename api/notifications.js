import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  "mailto:contact@recuvente.app",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  // ===== EMAIL DE BIENVENUE (déclenché par l'app à la création d'un espace) =====
  if (req.body?.type === "welcome") {
    const { email, workspaceName } = req.body;
    if (!email) return res.status(400).json({ error: "Email manquant" });

    try {
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: email,
        subject: `Bienvenue sur RecuVente, ${workspaceName || ""} !`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a7a3c; font-size: 22px;">Bienvenue sur RecuVente 👋</h1>
            <p style="color: #16231F; font-size: 15px; line-height: 1.6;">
              Ton espace <strong>${workspaceName || ""}</strong> est prêt. Tu as 7 jours d'essai gratuit, accès complet, sans carte bancaire.
            </p>
            <p style="color: #16231F; font-size: 15px; line-height: 1.6;">
              Pour bien démarrer :
            </p>
            <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">
              <li>Ajoute ta première commande</li>
              <li>Invite ton équipe (livreurs, closers, comptable)</li>
              <li>Connecte ta boutique Shopify si tu en as une</li>
            </ul>
            <a href="https://recuvente-saas.vercel.app/?auth=1" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
              Ouvrir mon espace
            </a>
            <p style="color: #8A9089; font-size: 12px; margin-top: 30px;">
              RecuVente — La gestion de commandes en paiement à la livraison
            </p>
          </div>
        `,
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Erreur envoi email:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ===== NOTIFICATION PUSH (déclenchée par le webhook Supabase, nouvelle commande) =====
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const commande = req.body.record;
  if (!commande || !commande.workspace_id) return res.status(400).json({ error: "Pas de commande fournie" });

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
