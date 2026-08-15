 import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHARIOW_API_KEY = process.env.CHARIOW_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  // ===== CAS 1 : Chariow nous notifie d'un paiement (Pulse webhook) =====
  // Reconnu par la présence du champ "event" envoyé automatiquement par Chariow
  if (req.body?.event) {
    const { event, data } = req.body;

    if (event === "sale.completed") {
      const emailClient = data?.customer?.email;
      const chariowProductId = data?.product?.id;

      if (!emailClient || !chariowProductId) {
        return res.status(200).json({ recu: true, ignore: "données incomplètes" });
      }

      // Retrouve le plan correspondant à ce produit Chariow
      const { data: plan } = await supabaseAdmin
        .from("subscription_plans")
        .select("id")
        .eq("chariow_product_id", chariowProductId)
        .maybeSingle();

      if (!plan) return res.status(200).json({ recu: true, ignore: "produit inconnu" });

      // Retrouve le workspace du client via son email (propriétaire)
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const utilisateur = usersList?.users.find((u) => u.email?.toLowerCase() === emailClient.toLowerCase());
      if (!utilisateur) return res.status(200).json({ recu: true, ignore: "client introuvable" });

      const { data: workspace } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("owner_id", utilisateur.id)
        .maybeSingle();

      if (!workspace) return res.status(200).json({ recu: true, ignore: "espace introuvable" });

      // Active l'abonnement automatiquement, sans intervention humaine
      const { data: existant } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("workspace_id", workspace.id)
        .maybeSingle();

      if (existant) {
        await supabaseAdmin.from("subscriptions").update({ status: "active", plan_id: plan.id }).eq("workspace_id", workspace.id);
      } else {
        await supabaseAdmin.from("subscriptions").insert([{ workspace_id: workspace.id, status: "active", plan_id: plan.id }]);
      }

      return res.status(200).json({ success: true, active: true });
    }

    return res.status(200).json({ recu: true, ignore: "événement non géré" });
  }

  // ===== CAS 2 : Notre app demande de créer un paiement =====
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "planId manquant" });

  const { data: plan } = await supabaseAdmin.from("subscription_plans").select("*").eq("id", planId).single();
  if (!plan || !plan.chariow_product_id) {
    return res.status(400).json({ error: "Ce plan n'est pas encore relié à Chariow. Contacte le support." });
  }

  try {
    const chariowRes = await fetch("https://api.chariow.com/v1/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHARIOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: plan.chariow_product_id,
        email: userData.user.email,
      }),
    });

    const chariowJson = await chariowRes.json();

    if (!chariowRes.ok) {
      return res.status(400).json({ error: chariowJson.message || "Erreur lors de la création du paiement" });
    }

    // L'URL de paiement se trouve dans data.url (ou équivalent selon la réponse Chariow)
    return res.status(200).json({ url: chariowJson.data?.url || chariowJson.data?.checkout_url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
