 // Reçoit les commandes Shopify de N'IMPORTE QUELLE entreprise cliente du SaaS.
// Chaque entreprise a sa PROPRE URL avec son secret unique — impossible pour
// une entreprise d'envoyer des commandes dans l'espace d'une autre.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const webhookSecret = req.query.secret;
  if (!webhookSecret) return res.status(400).json({ error: "Secret manquant dans l'URL" });

  // Retrouve l'entreprise correspondant à ce secret précis
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("webhook_secret", webhookSecret)
    .single();

  if (wsError || !workspace) {
    return res.status(404).json({ error: "Aucune entreprise ne correspond à ce lien. Vérifie l'URL." });
  }

  try {
    const order = req.body;

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

    const { error } = await supabaseAdmin.from("commandes").insert([
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
    ]);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
