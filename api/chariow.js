import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHARIOW_API_KEY = process.env.CHARIOW_API_KEY;

// Packs de crédits IA vendus via Chariow (variable Vercel CHARIOW_PACKS_IA, voir admin-panel.js).
function packsIA() {
  try {
    const l = JSON.parse(process.env.CHARIOW_PACKS_IA || "[]");
    return Array.isArray(l) ? l.filter((p) => p && p.id && Number(p.credits) > 0).map((p) => ({ id: String(p.id), credits: Number(p.credits) })) : [];
  } catch (_) { return []; }
}

// Retrouve l'utilisateur par e-mail en parcourant TOUTES les pages (la première page seule ne contient que 50 comptes :
// au-delà, un paiement d'un nouvel abonné ne trouvait personne et rien ne s'activait).
async function trouverUtilisateurParEmail(email) {
  const cible = String(email || "").toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    const liste = data?.users || [];
    const trouve = liste.find((u) => u.email?.toLowerCase() === cible);
    if (trouve) return trouve;
    if (liste.length < 1000) return null;
  }
  return null;
}

export default async function handler(req, res) {
  // Notification d'un paiement en ligne (CinetPay / PayDunya) : « /api/chariow?ipn=cinetpay&ref=… ».
  // Regroupé ici car l'offre gratuite de Vercel limite le nombre de fonctions. Le contenu reçu est ignoré :
  // le paiement est toujours revérifié auprès du fournisseur (voir lib/paiements.js).
  if (req.query && req.query.ipn) {
    try { return await (await import("../lib/paiements.js")).traiterIPN(req, res); }
    catch (e) { return res.status(500).json({ error: "Traitement impossible pour l'instant" }); }
  }

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

      // Pack de crédits IA : on ajoute les crédits à l'espace du client (une seule fois par vente).
      const pack = packsIA().find((p) => p.id === String(chariowProductId));
      if (pack) {
        const utilisateurPack = await trouverUtilisateurParEmail(emailClient);
        if (!utilisateurPack) return res.status(200).json({ recu: true, ignore: "client introuvable" });
        const { data: wsPack } = await supabaseAdmin.from("workspaces").select("id").eq("owner_id", utilisateurPack.id).maybeSingle();
        if (!wsPack) return res.status(200).json({ recu: true, ignore: "espace introuvable" });
        const idVente = String(data?.id || data?.sale_id || data?.sale?.id || req.body?.id || `${emailClient}:${chariowProductId}:${data?.created_at || ""}`).slice(0, 80);
        const typeAchat = `achat:${idVente}`;
        const { data: dejaCompte } = await supabaseAdmin.from("ia_usage").select("id").eq("workspace_id", wsPack.id).eq("type", typeAchat).maybeSingle();
        if (dejaCompte) return res.status(200).json({ recu: true, ignore: "vente déjà comptée" });
        const { error: errAchat } = await supabaseAdmin.from("ia_usage").insert([{ workspace_id: wsPack.id, type: typeAchat, poids: pack.credits }]);
        // Erreur (table pas encore créée…) : on répond une erreur pour que Chariow renvoie la notification plus tard.
        if (errAchat) return res.status(500).json({ error: "Crédits non enregistrés (table ia_usage manquante ?)" });
        return res.status(200).json({ success: true, credits_ajoutes: pack.credits });
      }

      // Retrouve le plan correspondant à ce produit Chariow
      const { data: plan } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, prix, devise")
        .eq("chariow_product_id", chariowProductId)
        .maybeSingle();

      if (!plan) return res.status(200).json({ recu: true, ignore: "produit inconnu" });

      // Retrouve le workspace du client via son email (propriétaire)
      const utilisateur = await trouverUtilisateurParEmail(emailClient);
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

      // Programme ambassadeur : si cette boutique a été parrainée, l'ambassadeur gagne sa commission (une fois par vente).
      try {
        const idVenteAbo = String(data?.id || data?.sale_id || data?.sale?.id || req.body?.id || `${emailClient}:${chariowProductId}:${data?.created_at || ""}`).slice(0, 100);
        await (await import("../lib/croissance.js")).enregistrerCommission({ workspaceId: workspace.id, venteRef: idVenteAbo, montantVente: plan.prix, devise: plan.devise });
      } catch (_) {}

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

  const { planId, packId, firstName, lastName, phone } = req.body;
  if (!planId && !packId) return res.status(400).json({ error: "planId manquant" });
  if (!firstName || !lastName || !phone) return res.status(400).json({ error: "Prénom, nom et téléphone requis" });

  // Achat d'un pack de crédits IA (l'id doit figurer dans CHARIOW_PACKS_IA : on n'accepte jamais un id libre).
  let idProduitChariow;
  if (packId) {
    const pack = packsIA().find((p) => p.id === String(packId));
    if (!pack) return res.status(400).json({ error: "Ce pack de crédits n'existe pas." });
    idProduitChariow = pack.id;
  } else {
    const { data: plan } = await supabaseAdmin.from("subscription_plans").select("*").eq("id", planId).single();
    if (!plan || !plan.chariow_product_id) {
      return res.status(400).json({ error: "Ce plan n'est pas encore relié à Chariow. Contacte le support." });
    }
    idProduitChariow = plan.chariow_product_id;
  }

  try {
    const chariowRes = await fetch("https://api.chariow.com/v1/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHARIOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: idProduitChariow,
        email: userData.user.email,
        first_name: firstName,
        last_name: lastName,
        phone: { number: phone, country_code: "CI" },
        redirect_url: "https://recuvente-saas.vercel.app?paiement=succes",
      }),
    });

    const chariowJson = await chariowRes.json();

    if (!chariowRes.ok) {
      return res.status(400).json({ error: chariowJson.message || "Erreur lors de la création du paiement" });
    }

    // L'URL de paiement se trouve dans data.url (ou équivalent selon la réponse Chariow)
    const step = chariowJson.data?.step;

    if (step === "already_purchased") {
      return res.status(200).json({ error: packId ? "Ce pack est déjà en cours de traitement : réessaie dans un instant." : "Tu as déjà ce plan actif." });
    }

    if (step === "completed") {
      // Produit gratuit — normalement pas notre cas, mais on gère proprement
      return res.status(200).json({ url: null, complete: true });
    }

    const checkoutUrl = chariowJson.data?.payment?.checkout_url;
    if (!checkoutUrl) {
      return res.status(200).json({ error: chariowJson.message || "Chariow n'a pas renvoyé de lien de paiement." });
    }

    return res.status(200).json({ url: checkoutUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
