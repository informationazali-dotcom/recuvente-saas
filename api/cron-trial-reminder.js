 import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Vercel Cron appelle cette fonction automatiquement chaque jour
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const dansDeuxJours = new Date();
  dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  const dansUnJour = new Date();
  dansUnJour.setDate(dansUnJour.getDate() + 1);

  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, workspace_id, trial_ends_at, status, rappel_envoye, workspaces(name, owner_id)")
    .eq("status", "trial")
    .eq("rappel_envoye", false)
    .lte("trial_ends_at", dansDeuxJours.toISOString())
    .gte("trial_ends_at", dansUnJour.toISOString());

  if (error) return res.status(500).json({ error: error.message });
  if (!subs || subs.length === 0) return res.status(200).json({ envoyes: 0 });

  let envoyes = 0;

  for (const sub of subs) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(sub.workspaces.owner_id);
    const email = userData?.user?.email;
    if (!email) continue;

    try {
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: email,
        subject: `Ton essai gratuit se termine bientôt — ${sub.workspaces.name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #e8920a; font-size: 20px;">⏳ Plus que 2 jours d'essai gratuit</h1>
            <p style="color: #16231F; font-size: 15px; line-height: 1.6;">
              Ton essai gratuit sur <strong>${sub.workspaces.name}</strong> se termine dans 2 jours. Passe sur un plan payant pour ne pas perdre l'accès à tes commandes.
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

  return res.status(200).json({ envoyes });
}
