import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

async function sauvegarderQuotidiennement() {
  try {
    const tables = ["workspaces", "commandes", "produits", "avis_produits", "collections", "collection_produits", "workspace_members"];
    const sauvegarde = {};
    for (const table of tables) {
      const { data } = await supabaseAdmin.from(table).select("*");
      sauvegarde[table] = data || [];
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const contenu = JSON.stringify(sauvegarde);
    await supabaseAdmin.storage
      .from("sauvegardes")
      .upload(`sauvegarde-${dateStr}.json`, contenu, { contentType: "application/json", upsert: true });

    // Garde seulement les 14 dernières sauvegardes pour ne pas saturer le stockage
    const { data: fichiers } = await supabaseAdmin.storage.from("sauvegardes").list();
    if (fichiers && fichiers.length > 14) {
      const aSupprimer = fichiers.sort((a, b) => a.name.localeCompare(b.name)).slice(0, fichiers.length - 14).map((f) => f.name);
      if (aSupprimer.length > 0) await supabaseAdmin.storage.from("sauvegardes").remove(aSupprimer);
    }
    return true;
  } catch (e) {
    console.error("Erreur sauvegarde quotidienne:", e);
    return false;
  }
}

export default async function handler(req, res) {
  // Vercel Cron appelle cette fonction automatiquement chaque jour
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const sauvegardeReussie = await sauvegarderQuotidiennement();

  const dansDeuxJours = new Date();
  dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  const dansUnJour = new Date();
  dansUnJour.setDate(dansUnJour.getDate() + 1);

  // ===== 1. Rappel au CLIENT — 2 jours avant la fin (existant, inchangé) =====
  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, workspace_id, trial_ends_at, status, rappel_envoye, workspaces(name, owner_id)")
    .eq("status", "trial")
    .eq("rappel_envoye", false)
    .lte("trial_ends_at", dansDeuxJours.toISOString())
    .gte("trial_ends_at", dansUnJour.toISOString());

  if (error) return res.status(500).json({ error: error.message });

  let envoyes = 0;
  if (subs && subs.length > 0) {
    for (const sub of subs) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(sub.workspaces.owner_id);
      const email = userData?.user?.email;
      if (!email) continue;
      try {
        await resend.emails.send({
          from: "RecuVente <onboarding@resend.dev>",
          to: email,
          subject: `Ton accès RecuVente se termine bientôt — ${sub.workspaces.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #e8920a; font-size: 20px;">⏳ Plus que 2 jours</h1>
              <p style="color: #16231F; font-size: 15px; line-height: 1.6;">
                Ton accès sur <strong>${sub.workspaces.name}</strong> se termine dans 2 jours. Choisis un plan pour continuer à utiliser tes commandes sans interruption.
              </p>
              <a href="https://recuvente-saas.vercel.app" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
                Choisir mon plan
              </a>
            </div>
          `,
        });
        await supabaseAdmin.from("subscriptions").update({ rappel_envoye: true }).eq("id", sub.id);
        envoyes++;
      } catch (e) {
        console.error("Erreur envoi rappel:", e);
      }
    }
  }

  // ===== 2. Notification à l'ADMIN (toi) — essais qui viennent d'expirer aujourd'hui =====
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);

  const { data: essaisExpires } = await supabaseAdmin
    .from("subscriptions")
    .select("id, trial_ends_at, workspaces(name)")
    .eq("status", "trial")
    .gte("trial_ends_at", hier.toISOString())
    .lt("trial_ends_at", aujourdhui.toISOString());

  let notifAdminEnvoyee = false;
  if (essaisExpires && essaisExpires.length > 0 && process.env.RECUVENTE_ADMIN_EMAIL) {
    try {
      const listeEntreprises = essaisExpires.map((s) => `<li>${s.workspaces.name}</li>`).join("");
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: process.env.RECUVENTE_ADMIN_EMAIL,
        subject: `📋 ${essaisExpires.length} essai${essaisExpires.length > 1 ? "s" : ""} gratuit${essaisExpires.length > 1 ? "s" : ""} terminé${essaisExpires.length > 1 ? "s" : ""} aujourd'hui`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #16231F; font-size: 18px;">📋 Essais gratuits terminés aujourd'hui</h1>
            <p style="color: #6B7168; font-size: 14px;">Ces entreprises ne peuvent plus ajouter de commandes tant qu'elles ne passent pas à un plan payant :</p>
            <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">${listeEntreprises}</ul>
            <a href="https://recuvente-saas.vercel.app/?admin=1" style="display: inline-block; background: #1a7a3c; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
              Voir le panneau Admin
            </a>
          </div>
        `,
      });
      notifAdminEnvoyee = true;
    } catch (e) {
      console.error("Erreur notification admin:", e);
    }
  }

  return res.status(200).json({ envoyes, essaisExpiresAujourdhui: essaisExpires?.length || 0, notifAdminEnvoyee, sauvegardeReussie });
}
