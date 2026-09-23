// ============================================================================
//  REVERSEMENT COMMERÇANT + COMMISSION PLATEFORME — paiements Stripe (marché Europe)
//  (Ce fichier est hors du dossier api/ : l'offre gratuite de Vercel limite le nombre de fonctions.)
//
//  RecuVente encaisse les paiements par carte avec UN SEUL compte Stripe (voir lib/stripe.js) —
//  l'argent d'un client va donc chez RecuVente, jamais directement chez le commerçant. Ce fichier
//  enregistre ce qui doit lui être reversé (montant reçu moins la commission de la plateforme),
//  exactement comme les commissions ambassadeur (lib/croissance.js) : RecuVente reverse
//  MANUELLEMENT (virement, PayPal...) et coche « reversé » une fois fait. Rien ici ne déplace
//  d'argent tout seul.
// ============================================================================
import { supabaseAdmin, UUID } from "./options.js";

// Commission de la plateforme sur un paiement Stripe, en % (réglable sans redéploiement via la
// variable Vercel STRIPE_COMMISSION_TAUX — même principe que AMBASSADEUR_TAUX). 5% par défaut :
// couvre les frais Stripe eux-mêmes (~1,5 à 2,9 % + frais fixe selon la carte) et une marge pour
// RecuVente. Chaque ligne garde le taux appliqué AU MOMENT du paiement — le changer ensuite ne
// modifie jamais un montant déjà calculé.
const tauxCommissionStripe = () => Math.max(0, Math.min(90, Number(process.env.STRIPE_COMMISSION_TAUX ?? 5)));

// Enregistre ce que RecuVente doit reverser au commerçant pour UN paiement Stripe déjà crédité à
// sa commande (appelée depuis lib/stripe.js, appliquerPaiement — jamais avant que le crédit au
// client ait réussi). Idempotent : paiement_en_ligne_id est unique, donc un même paiement Stripe
// ne peut jamais être compté deux fois, même si cette fonction était rappelée par erreur (retry,
// double webhook...). Ne lève jamais d'exception pour une raison qui ne soit pas un vrai bug —
// l'appelant l'entoure d'un try/catch et ne doit JAMAIS voir un paiement client bloqué à cause
// d'un problème ici.
export async function enregistrerReversementStripe({ workspaceId, paiementEnLigneId, commandeId, montant, devise }) {
  if (!UUID.test(String(workspaceId || "")) || !UUID.test(String(paiementEnLigneId || ""))) return;
  const montantCollecte = Number(montant) || 0;
  if (montantCollecte <= 0) return;

  const taux = tauxCommissionStripe();
  const montantCommission = Math.round(montantCollecte * taux) / 100;
  const montantDu = Math.round((montantCollecte - montantCommission) * 100) / 100;

  const { error } = await supabaseAdmin.from("reversements_stripe").insert([{
    workspace_id: workspaceId,
    paiement_en_ligne_id: paiementEnLigneId,
    commande_id: commandeId && UUID.test(String(commandeId)) ? commandeId : null,
    montant_collecte: montantCollecte,
    devise: String(devise || "EUR").toUpperCase().slice(0, 10),
    taux_commission: taux,
    montant_commission: montantCommission,
    montant_du: montantDu,
  }]);
  // "déjà enregistré" (paiement_en_ligne_id déjà présent) n'est pas une erreur : c'est
  // exactement la protection anti-doublon qui fait son travail.
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

function totauxParStatut(lignes) {
  const t = { du: {}, reverse: {} };
  for (const l of lignes) {
    const cle = l.statut === "reverse" ? "reverse" : "du";
    const d = l.devise || "EUR";
    t[cle][d] = (t[cle][d] || 0) + Number(l.montant_du || 0);
  }
  return t;
}

// ---------- Propriétaire RecuVente : liste de ce qui est dû à chaque boutique Europe ----------
export async function reversementsStripeAdminListe() {
  const { data: lignes } = await supabaseAdmin
    .from("reversements_stripe")
    .select("workspace_id, montant_du, devise, statut")
    .limit(10000);
  const idsAvecReversement = [...new Set((lignes || []).map((l) => l.workspace_id))];
  if (idsAvecReversement.length === 0) return { boutiques: [], taux: tauxCommissionStripe() };

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, stripe_contact_paiement")
    .in("id", idsAvecReversement);

  const boutiques = (ws || [])
    .map((w) => ({
      id: w.id,
      nom: w.name,
      contact_paiement: w.stripe_contact_paiement || "",
      totaux: totauxParStatut((lignes || []).filter((l) => l.workspace_id === w.id)),
    }))
    .sort((a, b) => Object.values(b.totaux.du).reduce((s, n) => s + n, 0) - Object.values(a.totaux.du).reduce((s, n) => s + n, 0));

  return { boutiques, taux: tauxCommissionStripe() };
}

// Marque « reversé » tout ce qui était « dû » pour une boutique (le virement/PayPal a été fait
// manuellement par le propriétaire de RecuVente AVANT de cliquer ici — même geste que pour les
// commissions ambassadeur).
export async function reversementsStripeMarquerReverse(workspaceId) {
  if (!UUID.test(String(workspaceId || ""))) return { ok: false };
  const { data } = await supabaseAdmin
    .from("reversements_stripe")
    .update({ statut: "reverse", reverse_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("statut", "du")
    .select("id");
  return { ok: true, reversements_marques: (data || []).length };
}
