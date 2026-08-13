 import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

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
