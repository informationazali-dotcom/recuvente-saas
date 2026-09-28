 // Reçoit les commandes Shopify de N'IMPORTE QUELLE entreprise cliente du SaaS.
// Chaque entreprise a sa PROPRE URL avec son secret unique — impossible pour
// une entreprise d'envoyer des commandes dans l'espace d'une autre.

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Désactive le découpage automatique du corps par Vercel : la vérification de signature Shopify
// (ci-dessous) a besoin du corps BRUT, exactement comme envoyé, avant tout JSON.parse — sinon la
// signature ne correspond jamais. On reparse nous-mêmes ce corps brut en JSON juste après l'avoir
// lu (même principe que api/chariow.js, verifierSignatureChariow).
export const config = {
  api: {
    bodyParser: false,
  },
};

function lireCorpsBrut(req) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    req.on("data", (c) => morceaux.push(c));
    req.on("end", () => resolve(Buffer.concat(morceaux)));
    req.on("error", reject);
  });
}

// Vérifie la signature d'un webhook Shopify : en-tête "X-Shopify-Hmac-Sha256" = base64 de
// HMAC-SHA256(corps brut, clé de signature des webhooks — visible dans Shopify Admin →
// Paramètres → Notifications, tout en bas de la page), comparée en temps constant. Tant que le
// marchand n'a pas encore collé cette clé dans "🛍️ Ma Boutique" (workspace.shopify_hmac_secret
// non renseigné), on laisse passer sans vérifier (verifie:false) plutôt que de bloquer par
// erreur — mêmes principes que verifierSignatureChariow dans api/chariow.js : mieux vaut ne pas
// encore protéger que de casser silencieusement la réception des commandes Shopify existantes.
function verifierSignatureShopify(corpsBrut, signatureRecue, secret) {
  if (!secret) return { ok: true, verifie: false };
  if (!signatureRecue) return { ok: false, verifie: true };
  const attendu = crypto.createHmac("sha256", secret).update(corpsBrut).digest("base64");
  const bufAttendu = Buffer.from(attendu);
  const bufRecu = Buffer.from(signatureRecue);
  if (bufAttendu.length !== bufRecu.length) return { ok: false, verifie: true };
  return { ok: crypto.timingSafeEqual(bufAttendu, bufRecu), verifie: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const webhookSecret = req.query.secret;
  if (!webhookSecret) return res.status(400).json({ error: "Secret manquant dans l'URL" });

  // Retrouve l'entreprise correspondant à ce secret précis
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, shopify_hmac_secret")
    .eq("webhook_secret", webhookSecret)
    .single();

  if (wsError || !workspace) {
    return res.status(404).json({ error: "Aucune entreprise ne correspond à ce lien. Vérifie l'URL." });
  }

  // Le découpage automatique du corps est désactivé (voir "config" en haut du fichier) : on le
  // lit nous-mêmes ici, une seule fois, puis on le reparse en JSON pour que tout le code plus bas
  // continue de fonctionner exactement comme avant.
  const corpsBrut = await lireCorpsBrut(req);

  const signature = verifierSignatureShopify(corpsBrut, req.headers["x-shopify-hmac-sha256"], workspace.shopify_hmac_secret);
  if (!signature.ok) {
    return res.status(401).json({ error: "Signature invalide. Vérifie la clé de signature des webhooks dans « 🛍️ Ma Boutique »." });
  }

  try {
    let order;
    try {
      order = JSON.parse(corpsBrut.toString("utf8") || "{}");
    } catch (_) {
      return res.status(400).json({ error: "Corps de la requête invalide (JSON attendu)." });
    }

    const client = order.customer
      ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
      : order.shipping_address?.name || "Client Shopify";

    const tel = order.shipping_address?.phone || order.customer?.phone || order.phone || "Non renseigné";

    const produits = (order.line_items || []).map((item) => `${item.title} x${item.quantity}`).join(", ");

    const montant = order.total_price || 0;

    const zone = order.shipping_address
      ? `${order.shipping_address.city || ""}, ${order.shipping_address.address1 || ""}`.trim()
      : "";

    // Attribution automatique au closer de CETTE entreprise ayant le moins de commandes actives
    let closerAssigne = null;
    const { data: closersList } = await supabaseAdmin.from("closers").select("nom").eq("workspace_id", workspace.id);
    if (closersList && closersList.length > 0) {
      const { data: commandesActives } = await supabaseAdmin
        .from("commandes")
        .select("closer")
        .eq("workspace_id", workspace.id)
        .in("statut", ["en_cours", "echouee"])
        .not("closer", "is", null);

      const charge = {};
      closersList.forEach((c) => (charge[c.nom] = 0));
      (commandesActives || []).forEach((o) => {
        if (charge[o.closer] !== undefined) charge[o.closer] += 1;
      });

      closerAssigne = closersList.reduce((min, c) => (charge[c.nom] < charge[min.nom] ? c : min), closersList[0]).nom;
    }

    const { data: commandeCreee, error } = await supabaseAdmin.from("commandes").insert([
      {
        workspace_id: workspace.id,
        client: client || "Client Shopify",
        tel,
        produit: produits || "Commande Shopify",
        montant: Number(montant),
        zone,
        statut: "en_cours",
        closer: closerAssigne,
      },
    ]).select("id, workspace_id, client, produit, montant, created_at").maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    // Notification push forte pour cette vente aussi (protégée : ne casse jamais le webhook).
    try {
      if (commandeCreee) {
        const module_notifs = await import("./notifications.js");
        await Promise.race([module_notifs.pousserNouvelleCommande(commandeCreee), new Promise((r) => setTimeout(r, 5000))]);
      }
    } catch (_) {}

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
