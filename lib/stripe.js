// ============================================================================
//  PAIEMENT STRIPE (marché Europe) — COMPTE UNIQUE PLATEFORME, PAS STRIPE CONNECT.
//  (Ce fichier est hors du dossier api/ : l'offre gratuite de Vercel limite le nombre de fonctions.)
//
//  RecuVente encaisse pour le compte des vendeurs Europe avec UNE SEULE clé Stripe (la clé de
//  RecuVente, process.env.STRIPE_SECRET_KEY). Voir supabase/migrations/202609230020_… pour le détail
//  de ce choix.
//
//  Pas de webhook Stripe dans ce lot (corps brut requis, incompatible avec le parsing JSON automatique
//  de Vercel, et le dossier api/ est déjà à sa limite de 12 fonctions). À la place : Stripe Checkout
//  Session + vérification côté serveur au retour du client (verifierPaiementStripe), avec un filet de
//  sécurité dans api/cron-daily.js pour les clients dont le navigateur ne reviendrait jamais confirmer.
//
//  Sécurité :
//   - On ne fait JAMAIS confiance à un statut envoyé par le client : on redemande toujours l'état réel
//     de la session à Stripe (checkout.sessions.retrieve) avant de créditer quoi que ce soit.
//   - Un paiement n'est crédité qu'une seule fois (verrou atomique sur paiements_en_ligne.statut),
//     même si verifierPaiementStripe est appelée plusieurs fois pour la même session.
//   - Une commande payée en ligne n'est PAS marquée « livrée » : elle reste à livrer (même logique que
//     lib/paiements.js pour CinetPay/PayDunya).
// ============================================================================
import crypto from "crypto";
import Stripe from "stripe";
import { supabaseAdmin, UUID } from "./options.js";

const REF = /^RV[0-9A-F]{16}$/;
const STATUTS_NON_PAYABLES = new Set(["annulee", "echouee", "retournee"]);

let stripeClient = null;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Le paiement par carte (Stripe) n'est pas configuré.");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function nouvelleReference() {
  return "RV" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

// ---------- Création de la session de paiement ----------
export async function creerSessionPaiementStripe({ commandeId, montant, devise, workspaceId, successUrl, cancelUrl }) {
  if (typeof commandeId !== "string" || !UUID.test(commandeId)) throw new Error("Commande invalide");
  if (!UUID.test(String(workspaceId || ""))) throw new Error("Espace de travail invalide");

  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, montant, montant_paye, statut, created_at")
    .eq("id", commandeId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!cmd) throw new Error("Commande introuvable");
  if (STATUTS_NON_PAYABLES.has(cmd.statut)) throw new Error("Cette commande n'est plus payable.");

  const reste = Number(cmd.montant) - Number(cmd.montant_paye || 0);
  if (!(reste > 0)) throw new Error("Cette commande est déjà entièrement payée.");

  const montantAFacturer = Number(montant) > 0 ? Number(montant) : reste;
  const deviseFinale = String(devise || "EUR").toLowerCase();

  // Réutilise une session récente encore en attente pour le même montant plutôt que d'en recréer une
  // à chaque clic (évite les doublons dans paiements_en_ligne, même logique que CinetPay/PayDunya).
  const depuis20 = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: recents } = await supabaseAdmin
    .from("paiements_en_ligne")
    .select("reference, montant, lien, jeton, statut, created_at")
    .eq("commande_id", cmd.id)
    .eq("provider", "stripe")
    .eq("statut", "en_attente")
    .gte("created_at", depuis20)
    .order("created_at", { ascending: false })
    .limit(6);
  const reutilisable = (recents || []).find((r) => r.lien && r.jeton && Number(r.montant) === montantAFacturer);
  if (reutilisable) return { url: reutilisable.lien, reference: reutilisable.reference };

  const reference = nouvelleReference();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: deviseFinale,
          unit_amount: Math.round(montantAFacturer * 100),
          product_data: { name: `Commande ${String(cmd.client || "").slice(0, 80) || reference}` },
        },
        quantity: 1,
      },
    ],
    client_reference_id: reference,
    metadata: { reference, commande_id: cmd.id, workspace_id: workspaceId },
    success_url: successUrl || `${cancelUrl || ""}`,
    cancel_url: cancelUrl || successUrl || "",
  });

  const { error } = await supabaseAdmin.from("paiements_en_ligne").insert([{
    reference,
    workspace_id: workspaceId,
    commande_id: cmd.id,
    provider: "stripe",
    montant: montantAFacturer,
    devise: deviseFinale.toUpperCase(),
    jeton: session.id,
    lien: session.url,
    statut: "en_attente",
  }]);
  if (error) throw new Error("Paiement en ligne pas encore installé (table manquante).");

  return { url: session.url, reference, session_id: session.id };
}

// ---------- Crédit idempotent d'un paiement confirmé ----------
async function appliquerPaiement(p, montantRecu, stripeCustomerId) {
  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, montant, montant_paye, statut")
    .eq("id", p.commande_id)
    .maybeSingle();
  if (!cmd) throw new Error("commande introuvable");
  const reste = Math.max(0, Number(cmd.montant) - Number(cmd.montant_paye || 0));
  const credit = Math.min(Number(montantRecu), reste);
  if (credit > 0) {
    // Déjà inscrit lors d'un essai précédent interrompu ? Alors on ne l'inscrit pas deux fois.
    const { data: deja } = await supabaseAdmin
      .from("paiements_commande")
      .select("id")
      .eq("commande_id", cmd.id)
      .like("enregistre_par", `%${p.reference}%`)
      .limit(1);
    if (!deja || deja.length === 0) {
      const ligne = {
        workspace_id: cmd.workspace_id,
        commande_id: cmd.id,
        montant: credit,
        mode_paiement: "en_ligne",
        enregistre_par: `En ligne (Stripe) ${p.reference}`,
      };
      let { error } = await supabaseAdmin.from("paiements_commande").insert([ligne]);
      if (error) ({ error } = await supabaseAdmin.from("paiements_commande").insert([{ ...ligne, mode_paiement: "cash" }]));
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabaseAdmin.from("commandes").update({ montant_paye: Number(cmd.montant_paye || 0) + credit }).eq("id", cmd.id);
      if (e2) throw new Error(e2.message);
    }
  }
  try {
    const notifs = await import("../api/notifications.js");
    await Promise.race([notifs.pousserPaiementRecu({ commande: cmd, montant: montantRecu, devise: p.devise }), new Promise((r) => setTimeout(r, 5000))]);
  } catch (_) {}
  if (stripeCustomerId) {
    await supabaseAdmin.from("paiements_en_ligne").update({ stripe_customer_id: String(stripeCustomerId).slice(0, 200) }).eq("id", p.id);
  }
  return { credit };
}

// Vérifie l'état réel d'une session Stripe et, si et seulement si elle est payée, crédite la commande.
// Idempotent : un paiement déjà marqué « payé » n'est jamais retraité.
export async function verifierPaiementStripe({ sessionId, reference }) {
  let p = null;
  if (sessionId) {
    const { data } = await supabaseAdmin.from("paiements_en_ligne").select("*").eq("jeton", sessionId).eq("provider", "stripe").maybeSingle();
    p = data;
  } else if (reference && REF.test(String(reference).toUpperCase())) {
    const { data } = await supabaseAdmin.from("paiements_en_ligne").select("*").eq("reference", String(reference).toUpperCase()).eq("provider", "stripe").maybeSingle();
    p = data;
  }
  if (!p) return { statut: "inconnu" };
  if (p.statut === "paye") return { statut: "paye", applique: false };

  const session = await stripe().checkout.sessions.retrieve(p.jeton);
  if (session.payment_status !== "paid") return { statut: session.payment_status === "unpaid" ? "attente" : "attente", applique: false };

  // Stripe affirme « payé » : on contrôle que le montant et la monnaie correspondent bien avant de créditer.
  const attendu = Number(p.montant);
  const recu = Number(session.amount_total) / 100;
  const memeMonnaie = !session.currency || String(session.currency).toUpperCase() === String(p.devise || "").toUpperCase();
  if (!(Number.isFinite(recu) && recu + 0.0001 >= attendu) || !memeMonnaie) {
    return { statut: "incoherent", applique: false };
  }

  // Verrou atomique : un seul appel peut faire passer le paiement à « payé » ; les autres s'arrêtent là.
  const { data: gagne } = await supabaseAdmin
    .from("paiements_en_ligne")
    .update({ statut: "paye", paid_at: new Date().toISOString(), montant_paye: recu, stripe_payment_intent_id: String(session.payment_intent || "").slice(0, 200) || null })
    .eq("id", p.id)
    .neq("statut", "paye")
    .select("id");
  if (!gagne || gagne.length === 0) return { statut: "paye", applique: false };
  try {
    await appliquerPaiement(p, recu, session.customer);
  } catch (e) {
    // Le crédit n'a pas pu s'inscrire : on relâche le verrou pour que le prochain contrôle réessaie.
    await supabaseAdmin.from("paiements_en_ligne").update({ statut: "en_attente", paid_at: null, montant_paye: null }).eq("id", p.id);
    throw e;
  }
  return { statut: "paye", applique: true };
}

// Filet de sécurité (appelé par le contrôle quotidien) : vérifie les paiements Stripe restés
// « en attente » depuis plus de 2 heures, au cas où le client ne serait jamais revenu confirmer.
export async function rattraperPaiementsStripeEnAttente() {
  if (!process.env.STRIPE_SECRET_KEY) return { verifies: 0, valides: 0 };
  const avant = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("paiements_en_ligne")
    .select("jeton")
    .eq("provider", "stripe")
    .eq("statut", "en_attente")
    .lte("created_at", avant)
    .gte("created_at", depuis)
    .limit(100);
  let valides = 0;
  for (const p of data || []) {
    try {
      const r = await verifierPaiementStripe({ sessionId: p.jeton });
      if (r.applique) valides += 1;
    } catch (_) {}
  }
  return { verifies: (data || []).length, valides };
}
