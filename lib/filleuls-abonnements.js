// ============================================================================
//  ABONNEMENT PERSONNEL DU FILLEUL — encaissé par RecuVente (compte Chariow
//  plateforme, EXACTEMENT le même compte que pour l'abonnement des boutiques
//  et les packs de crédits IA — voir api/chariow.js), PAS par le compte
//  CinetPay/PayDunya du commerçant (celui-là encaisse pour LUI, voir
//  lib/paiements.js — le réutiliser ici aurait envoyé l'argent au mauvais
//  endroit).
//
//  Catalogue des produits Chariow pour cet abonnement, un par devise, configuré
//  via la variable Vercel CHARIOW_ABONNEMENT_FILLEUL, même format que
//  CHARIOW_PACKS_IA :
//    CHARIOW_ABONNEMENT_FILLEUL = [
//      {"id":"<id produit Chariow>","devise":"XOF","prix":2000,"nom":"Abonnement Partenaire"},
//      {"id":"<id produit Chariow>","devise":"EUR","prix":5,"nom":"Abonnement Partenaire"}
//    ]
//  Un seul prix par devise pour l'instant (pas encore réglable boutique par boutique) —
//  simplification volontaire du premier jet, facile à affiner plus tard si besoin.
// ============================================================================
import crypto from "crypto";
import { supabaseAdmin } from "./options.js";

const CHARIOW_API_KEY = process.env.CHARIOW_API_KEY;

function produitsAbonnementFilleul() {
  try {
    const l = JSON.parse(process.env.CHARIOW_ABONNEMENT_FILLEUL || "[]");
    return Array.isArray(l)
      ? l.filter((p) => p && p.id && p.devise && Number(p.prix) > 0)
          .map((p) => ({ id: String(p.id), devise: String(p.devise).toUpperCase(), prix: Number(p.prix), nom: p.nom || "Abonnement Partenaire" }))
      : [];
  } catch (_) {
    return [];
  }
}

function nouvelleReference() {
  return "RVAB" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

// ---------- Le filleul démarre le paiement de son abonnement ----------
export async function creerPaiementAbonnementFilleul(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { firstName, lastName, phone } = req.body || {};
  if (!firstName || !lastName || !phone) return res.status(400).json({ error: "Prénom, nom et téléphone requis" });

  const { data: filleul } = await supabaseAdmin
    .from("filleuls")
    .select("id, workspace_id, nom")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!filleul) return res.status(404).json({ error: "Profil partenaire introuvable pour ce compte." });

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, currency, filleul_abonnement_actif")
    .eq("id", filleul.workspace_id)
    .maybeSingle();
  if (!workspace || !workspace.filleul_abonnement_actif) {
    return res.status(400).json({ error: "L'abonnement partenaire n'est pas activé pour cette boutique." });
  }

  const produit = produitsAbonnementFilleul().find((p) => p.devise === String(workspace.currency || "").toUpperCase());
  if (!produit || !CHARIOW_API_KEY) {
    return res.status(400).json({ error: "Le paiement de l'abonnement partenaire n'est pas encore configuré pour cette devise. Contacte le support." });
  }

  const reference = nouvelleReference();
  const { error: errInsert } = await supabaseAdmin.from("filleuls_abonnement_paiements").insert([
    {
      reference,
      workspace_id: workspace.id,
      filleul_id: filleul.id,
      chariow_product_id: produit.id,
      montant: produit.prix,
      devise: produit.devise,
      statut: "en_attente",
    },
  ]);
  if (errInsert) return res.status(500).json({ error: "Impossible de démarrer le paiement pour l'instant." });

  try {
    const chariowRes = await fetch("https://api.chariow.com/v1/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${CHARIOW_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: produit.id,
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
    const checkoutUrl = chariowJson.data?.payment?.checkout_url;
    if (!checkoutUrl) {
      if (chariowJson.data?.step === "already_purchased") {
        return res.status(200).json({ error: "Un paiement est déjà en cours de traitement : réessaie dans un instant." });
      }
      return res.status(400).json({ error: "Lien de paiement introuvable dans la réponse Chariow." });
    }
    return res.status(200).json({ url: checkoutUrl, reference });
  } catch (e) {
    return res.status(500).json({ error: "Connexion au service de paiement impossible pour l'instant." });
  }
}

// ---------- Le filleul consulte l'état de son abonnement ----------
export async function statutAbonnementFilleul(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { data: filleul } = await supabaseAdmin.from("filleuls").select("id").eq("user_id", userData.user.id).maybeSingle();
  if (!filleul) return res.status(404).json({ error: "Profil partenaire introuvable." });

  const { data: abo } = await supabaseAdmin
    .from("filleuls_abonnements")
    .select("statut, seuil_atteint_at, grace_expire_at, periode_fin, dernier_paiement_at")
    .eq("filleul_id", filleul.id)
    .maybeSingle();

  return res.status(200).json({ abonnement: abo || { statut: "non_requis" } });
}

// ---------- Webhook Chariow : confirme le paiement et débloque le filleul ----------
// Appelé depuis api/chariow.js, après avoir reconnu un chariow_product_id présent
// dans CHARIOW_ABONNEMENT_FILLEUL (voir ce fichier pour le routage).
//
// IMPORTANT : le produit Chariow est partagé par TOUS les filleuls d'une même devise
// (un seul produit par devise, pas un produit par filleul). On ne peut donc PAS se
// contenter de prendre "le paiement en_attente le plus récent pour ce produit" — si
// deux filleuls ont un paiement en attente en même temps pour la même devise, ça
// créditerait la mauvaise personne. On identifie le filleul via l'utilisateur Supabase
// déjà retrouvé par e-mail côté api/chariow.js (userId), exactement comme le fait ce
// fichier pour l'abonnement boutique et les crédits IA.
export async function confirmerPaiementAbonnementFilleulDepuisWebhook({ chariowProductId, userId }) {
  const produit = produitsAbonnementFilleul().find((p) => p.id === String(chariowProductId));
  if (!produit) return { traite: false, raison: "produit non reconnu" };
  if (!userId) return { traite: false, raison: "utilisateur introuvable" };

  const { data: filleul } = await supabaseAdmin.from("filleuls").select("id").eq("user_id", userId).maybeSingle();
  if (!filleul) return { traite: false, raison: "aucun profil partenaire pour cet utilisateur" };

  // Le paiement en_attente le plus récent DE CE FILLEUL pour ce produit — on ne fait PAS
  // confiance au contenu du webhook pour le montant/la devise, seulement pour déclencher
  // la vérification ; le montant crédité vient de notre propre ligne, jamais du webhook.
  const { data: paiement } = await supabaseAdmin
    .from("filleuls_abonnement_paiements")
    .select("reference")
    .eq("chariow_product_id", chariowProductId)
    .eq("filleul_id", filleul.id)
    .eq("statut", "en_attente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!paiement) return { traite: false, raison: "aucun paiement en attente pour ce filleul" };

  const { data: ok } = await supabaseAdmin.rpc("fn_confirmer_paiement_abonnement_filleul", { p_reference: paiement.reference });
  return { traite: !!ok, reference: paiement.reference };
}

export function estUnProduitAbonnementFilleul(chariowProductId) {
  return produitsAbonnementFilleul().some((p) => p.id === String(chariowProductId));
}
