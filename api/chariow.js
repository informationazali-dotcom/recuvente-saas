import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHARIOW_API_KEY = process.env.CHARIOW_API_KEY;

// Désactive le découpage automatique du corps de la requête par Vercel : la vérification de
// signature Chariow (ci-dessous) a besoin du corps BRUT, exactement comme envoyé, avant tout
// JSON.parse — sinon la signature ne correspond jamais. On reparse nous-mêmes ce corps brut en
// JSON juste après l'avoir lu, donc rien ne change pour le reste du code (req.body continue de
// fonctionner normalement pour CAS 2/2bis, l'appel de notre propre app).
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

// Vérifie la signature d'un webhook Chariow (guide officiel "Pulse Security") :
// en-tête "x-chariow-signature" = "sha256=" + HMAC-SHA256(corps brut, secret de signature),
// comparée en temps constant pour éviter qu'un attaquant devine le bon résultat octet par octet.
// Tant que CHARIOW_PULSE_SECRET n'est pas encore configuré sur Vercel, on laisse passer sans
// vérifier (verifie:false) plutôt que de tout bloquer par erreur — mieux vaut ne pas encore
// protéger que de casser silencieusement l'activation des abonnements le jour du déploiement.
function verifierSignatureChariow(corpsBrut, signatureRecue) {
  const secret = process.env.CHARIOW_PULSE_SECRET;
  if (!secret) return { ok: true, verifie: false };
  if (!signatureRecue || !signatureRecue.startsWith("sha256=")) return { ok: false, verifie: true };
  const attendu = "sha256=" + crypto.createHmac("sha256", secret).update(corpsBrut).digest("hex");
  const bufAttendu = Buffer.from(attendu);
  const bufRecu = Buffer.from(signatureRecue);
  if (bufAttendu.length !== bufRecu.length) return { ok: false, verifie: true };
  return { ok: crypto.timingSafeEqual(bufAttendu, bufRecu), verifie: true };
}

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

  // Le filleul consulte l'état de son abonnement personnel : « /api/chariow?abonnement_filleul_statut=1 ».
  if (req.method === "GET" && req.query && req.query.abonnement_filleul_statut) {
    return (await import("../lib/filleuls-abonnements.js")).statutAbonnementFilleul(req, res);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  // Le découpage automatique du corps est désactivé (voir "config" en haut du fichier) : on le lit
  // nous-mêmes ici, une seule fois, puis on le reparse en JSON pour que tout le code plus bas
  // continue de fonctionner exactement comme avant.
  const corpsBrut = await lireCorpsBrut(req);
  try {
    req.body = corpsBrut.length ? JSON.parse(corpsBrut.toString("utf8")) : {};
  } catch (_) {
    req.body = {};
  }

  // ===== CAS 1 : Chariow nous notifie d'un paiement (Pulse webhook) =====
  // Reconnu par la présence du champ "event" envoyé automatiquement par Chariow
  if (req.body?.event) {
    // Vérifie que la notification vient bien de Chariow (et non d'un tiers qui aurait deviné
    // l'URL du webhook) avant de faire quoi que ce soit — voir verifierSignatureChariow ci-dessus.
    const verifSignature = verifierSignatureChariow(corpsBrut, req.headers["x-chariow-signature"]);
    if (!verifSignature.ok) {
      console.error("Webhook Chariow rejeté : signature invalide ou absente.");
      return res.status(401).json({ error: "Signature invalide" });
    }
    if (!verifSignature.verifie) {
      console.warn("Webhook Chariow : CHARIOW_PULSE_SECRET n'est pas encore configuré sur Vercel — signature non vérifiée pour l'instant.");
    }

    const { event } = req.body;

    // IMPORTANT (trouvé pendant l'audit sécurité des abonnements) : la documentation officielle
    // de Chariow (guide "Pulses") nomme cet événement "successful.sale", et place "customer",
    // "product" et "sale" directement à la racine du corps reçu — PAS "sale.completed" avec un
    // champ "data" imbriqué comme le code le vérifiait jusqu'ici. Avec l'ancienne condition, un
    // vrai paiement Chariow ne pouvait jamais correspondre : chaque abonnement payé aurait
    // silencieusement échoué à s'activer tout seul (retour "données incomplètes" à chaque fois,
    // nécessitant une activation manuelle via le panneau admin). On accepte maintenant les deux
    // noms d'événement et les deux emplacements de champs, par prudence (au cas où l'ancienne
    // forme aurait un jour été correcte pour ce compte) : ça ne peut rien casser, seulement
    // reconnaître plus de cas.
    if (event === "successful.sale" || event === "sale.completed") {
      const data = req.body?.data; // ancienne forme imbriquée, gardée uniquement en repli
      const emailClient = req.body?.customer?.email || data?.customer?.email;
      const chariowProductId = req.body?.product?.id || data?.product?.id;
      const idBrutVente = req.body?.sale?.id || data?.id || data?.sale_id || data?.sale?.id || req.body?.id;
      const dateBrute = req.body?.sale?.created_at || data?.created_at;

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
        const idVente = String(idBrutVente || `${emailClient}:${chariowProductId}:${dateBrute || ""}`).slice(0, 80);
        const typeAchat = `achat:${idVente}`;
        const { data: dejaCompte } = await supabaseAdmin.from("ia_usage").select("id").eq("workspace_id", wsPack.id).eq("type", typeAchat).maybeSingle();
        if (dejaCompte) return res.status(200).json({ recu: true, ignore: "vente déjà comptée" });
        const { error: errAchat } = await supabaseAdmin.from("ia_usage").insert([{ workspace_id: wsPack.id, type: typeAchat, poids: pack.credits }]);
        // Erreur (table pas encore créée…) : on répond une erreur pour que Chariow renvoie la notification plus tard.
        if (errAchat) return res.status(500).json({ error: "Crédits non enregistrés (table ia_usage manquante ?)" });
        return res.status(200).json({ success: true, credits_ajoutes: pack.credits });
      }

      // Abonnement personnel d'un filleul (voir lib/filleuls-abonnements.js) : PAS le même
      // compte que le commerçant (CinetPay/PayDunya, lib/paiements.js) — celui-ci encaisse
      // pour RecuVente, via le même compte Chariow que l'abonnement boutique ci-dessous.
      const modAbonnementFilleul = await import("../lib/filleuls-abonnements.js");
      if (modAbonnementFilleul.estUnProduitAbonnementFilleul(chariowProductId)) {
        const utilisateurFilleul = await trouverUtilisateurParEmail(emailClient);
        if (!utilisateurFilleul) return res.status(200).json({ recu: true, ignore: "client introuvable" });
        const resultat = await modAbonnementFilleul.confirmerPaiementAbonnementFilleulDepuisWebhook({
          chariowProductId,
          userId: utilisateurFilleul.id,
        });
        if (!resultat.traite) return res.status(200).json({ recu: true, ignore: resultat.raison || "non traité" });
        return res.status(200).json({ success: true, abonnement_filleul_actif: true });
      }

      // Retrouve le plan correspondant à ce produit Chariow
      const { data: plan } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, nom, prix, devise")
        .eq("chariow_product_id", chariowProductId)
        .maybeSingle();

      if (!plan) return res.status(200).json({ recu: true, ignore: "produit inconnu" });

      // Retrouve le workspace du client via son email (propriétaire)
      const utilisateur = await trouverUtilisateurParEmail(emailClient);
      if (!utilisateur) return res.status(200).json({ recu: true, ignore: "client introuvable" });

      const { data: workspace } = await supabaseAdmin
        .from("workspaces")
        .select("id, name")
        .eq("owner_id", utilisateur.id)
        .maybeSingle();

      if (!workspace) return res.status(200).json({ recu: true, ignore: "espace introuvable" });

      // Active l'abonnement automatiquement, sans intervention humaine.
      // current_period_end : fixe la prochaine échéance à 1 mois (même règle que la confirmation
      // manuelle dans api/confirmer-paiement.js), pour que l'accès s'arrête vraiment si la personne
      // ne repaie pas — voir sql/lot10-expiration-abonnements.sql pour la vérification côté base.
      const periodeFin = new Date();
      periodeFin.setMonth(periodeFin.getMonth() + 1);

      const { data: existant } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("workspace_id", workspace.id)
        .maybeSingle();

      // rappel_renouvellement_envoye remis à false : nouvelle période payée, donc le rappel de
      // "renouvellement proche" (api/cron-daily.js) doit pouvoir se redéclencher pour celle-ci.
      if (existant) {
        await supabaseAdmin.from("subscriptions").update({ status: "active", plan_id: plan.id, current_period_end: periodeFin.toISOString(), rappel_renouvellement_envoye: false }).eq("workspace_id", workspace.id);
      } else {
        await supabaseAdmin.from("subscriptions").insert([{ workspace_id: workspace.id, status: "active", plan_id: plan.id, current_period_end: periodeFin.toISOString(), rappel_renouvellement_envoye: false }]);
      }

      // Programme ambassadeur : si cette boutique a été parrainée, l'ambassadeur gagne sa commission (une fois par vente).
      try {
        const idVenteAbo = String(idBrutVente || `${emailClient}:${chariowProductId}:${dateBrute || ""}`).slice(0, 100);
        await (await import("../lib/croissance.js")).enregistrerCommission({ workspaceId: workspace.id, venteRef: idVenteAbo, montantVente: plan.prix, devise: plan.devise });
      } catch (_) {}

      // Reçu par e-mail (jamais bloquant : le paiement reste confirmé même si l'e-mail échoue).
      try {
        const origine = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://recuvente-saas.vercel.app";
        await fetch(`${origine}/api/notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "recu_abonnement", email: emailClient, workspaceName: workspace.name, planName: plan.nom, montant: plan.prix, devise: plan.devise, periodeFin: periodeFin.toISOString() }),
        });
      } catch (_) {}

      return res.status(200).json({ success: true, active: true });
    }

    return res.status(200).json({ recu: true, ignore: "événement non géré" });
  }

  // ===== CAS 2bis : le filleul démarre le paiement de son abonnement personnel =====
  // Regroupé ici (même endpoint /api/chariow) pour rester dans la limite de fonctions Vercel.
  // Cette fonction fait sa propre vérification d'authentification, indépendamment de CAS 2
  // ci-dessous (qui concerne l'abonnement de la boutique, pas celui du filleul).
  if (req.body?.abonnementFilleul === true) {
    return (await import("../lib/filleuls-abonnements.js")).creerPaiementAbonnementFilleul(req, res);
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
