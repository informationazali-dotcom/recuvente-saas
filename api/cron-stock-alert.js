 import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);
const SEUIL_ALERTE = 5;

function parseProduitTexte(texte) {
  if (!texte) return { nom: "", quantite: 1 };
  const match = texte.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
  if (match) return { nom: match[1].trim(), quantite: Number(match[2]) || 1 };
  return { nom: texte.trim(), quantite: 1 };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const { data: workspaces, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name, owner_id");
  if (wsError) return res.status(500).json({ error: wsError.message });

  let alertesEnvoyees = 0;

  for (const ws of workspaces || []) {
    const { data: produits } = await supabaseAdmin.from("produits").select("*").eq("workspace_id", ws.id);
    if (!produits || produits.length === 0) continue;

    const { data: commandes } = await supabaseAdmin
      .from("commandes")
      .select("produit, statut")
      .eq("workspace_id", ws.id)
      .neq("statut", "echouee");

    const quantitesEngagees = {};
    (commandes || []).forEach((c) => {
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      quantitesEngagees[nom] = (quantitesEngagees[nom] || 0) + quantite;
    });

    const produitsBas = [];
    for (const p of produits) {
      const stock = Number(p.stock_initial || 0);
      if (stock <= 0) continue; // pas de stock défini, on ignore
      const engage = quantitesEngagees[p.nom] || 0;
      const restant = stock - engage;

      const dejaAlerteRecemment = p.derniere_alerte_stock && (Date.now() - new Date(p.derniere_alerte_stock).getTime()) < 3 * 24 * 3600 * 1000;

      if (restant <= SEUIL_ALERTE && !dejaAlerteRecemment) {
        produitsBas.push({ ...p, restant });
      }
    }

    if (produitsBas.length === 0) continue;

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
    const email = userData?.user?.email;
    if (!email) continue;

    try {
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: email,
        subject: `⚠️ Stock bas — ${produitsBas.length} produit${produitsBas.length > 1 ? "s" : ""} à réapprovisionner`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #D64933; font-size: 20px;">⚠️ Stock bientôt épuisé — ${ws.name}</h1>
            <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">
              ${produitsBas.map((p) => `<li><strong>${p.nom}</strong> — ${p.restant <= 0 ? "épuisé" : `${p.restant} restant${p.restant > 1 ? "s" : ""}`}</li>`).join("")}
            </ul>
            <a href="https://recuvente-saas.vercel.app" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
              Gérer mon stock
            </a>
          </div>
        `,
      });

      for (const p of produitsBas) {
        await supabaseAdmin.from("produits").update({ derniere_alerte_stock: new Date().toISOString() }).eq("id", p.id);
      }
      alertesEnvoyees++;
    } catch (e) {
      console.error("Erreur envoi alerte stock:", e);
    }
  }

  return res.status(200).json({ alertesEnvoyees });
}
