// ============================================================================
//  CROISSANCE : réseau anti-refus entre boutiques, programme ambassadeur, annuaire public.
//  (Ce fichier est hors du dossier api/ : l'offre gratuite de Vercel limite le nombre de fonctions.)
//
//  Principes :
//   - Réseau anti-refus : on ne partage QUE des chiffres (combien de boutiques ont eu des refus sur ce numéro),
//     jamais de nom, jamais de boutique, jamais de contenu de commande. Chaque boutique peut s'en retirer ;
//     une boutique retirée n'est ni comptée ni autorisée à interroger le réseau.
//   - Ambassadeurs : la commission est calculée par le serveur au moment de la vente Chariow (idempotent :
//     une vente = une commission au maximum). Rien n'est versé automatiquement : le propriétaire de RecuVente
//     voit les montants dus et marque « payé » une fois le virement fait.
//   - Annuaire : uniquement les boutiques qui l'ont demandé (case cochée) ET dont la boutique est publiée.
// ============================================================================
import crypto from "crypto";
import { supabaseAdmin, UUID, urlApp, lireOption, ecrireOption, tropDeRequetes, ipDe, roleMembre } from "./options.js";
import { actionMarchand, ACTIONS_MARCHAND_PAIEMENT } from "./paiements.js";

export const CATEGORIES_ANNUAIRE = [
  "Mode & vêtements", "Beauté & cosmétiques", "Électronique & téléphones", "Maison & déco", "Alimentation & boissons",
  "Santé & bien-être", "Bébé & enfants", "Bijoux & accessoires", "Auto & moto", "Autre",
];

const tauxAmbassadeur = () => Math.min(90, Math.max(0, Number(process.env.AMBASSADEUR_TAUX ?? 20)));
const moisAmbassadeur = () => Math.max(1, Math.round(Number(process.env.AMBASSADEUR_MOIS ?? 12)));

// ---------- Réseau anti-refus ----------
export const cleTelephone = (tel) => String(tel || "").replace(/\D/g, "").slice(-8);

async function reseauActif(workspaceId) {
  const v = await lireOption(workspaceId, "reseau_anti_refus");
  return !(v && v.actif === false);
}

export async function reseauVerifier(workspaceId, telephones) {
  if (!(await reseauActif(workspaceId))) return { actif: false, resultats: {} };
  const cles = [...new Set((Array.isArray(telephones) ? telephones : []).map(cleTelephone).filter((k) => k.length === 8))].slice(0, 300);
  if (cles.length === 0) return { actif: true, resultats: {} };
  const { data, error } = await supabaseAdmin.rpc("risque_reseau", { p_cles: cles, p_workspace: workspaceId });
  if (error) return { actif: true, indisponible: true, resultats: {} };
  const resultats = {};
  for (const l of data || []) {
    const refus = Number(l.refus) || 0, livrees = Number(l.livrees) || 0, boutiques = Number(l.boutiques) || 0;
    let niveau = null;
    if (boutiques >= 2 && refus >= 3 && refus > livrees * 2) niveau = "eleve";
    else if (refus >= 1 && refus > livrees) niveau = "attention";
    if (niveau) resultats[l.cle] = { boutiques, refus, livrees, niveau };
  }
  return { actif: true, resultats };
}

// ---------- Ambassadeurs ----------
function fabriquerCode(nom) {
  const base = String(nom || "").normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5) || "RV";
  return base + crypto.randomBytes(3).toString("hex").toUpperCase();
}

async function ambassadeurDe(user, creer) {
  const { data } = await supabaseAdmin.from("ambassadeurs").select("*").eq("user_id", user.id).maybeSingle();
  if (data || !creer) return data || null;
  const nom = user.user_metadata?.full_name || user.user_metadata?.name || String(user.email || "").split("@")[0];
  for (let i = 0; i < 5; i++) {
    const { data: cree, error } = await supabaseAdmin
      .from("ambassadeurs").insert([{ user_id: user.id, code: fabriquerCode(nom), nom: String(nom || "").slice(0, 80) }]).select("*").maybeSingle();
    if (cree) return cree;
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    const { data: existe } = await supabaseAdmin.from("ambassadeurs").select("*").eq("user_id", user.id).maybeSingle();
    if (existe) return existe;
  }
  throw new Error("Impossible de créer ton code pour l'instant.");
}

function totaux(commissions) {
  const t = { due: {}, payee: {} };
  for (const c of commissions) {
    const k = c.statut === "payee" ? "payee" : "due";
    const d = c.devise || "XOF";
    t[k][d] = (t[k][d] || 0) + Number(c.montant || 0);
  }
  return t;
}

async function ambassadeurMoi(user) {
  const amb = await ambassadeurDe(user, true);
  const { data: parr } = await supabaseAdmin.from("ambassadeur_parrainages").select("workspace_id, created_at").eq("ambassadeur_id", amb.id).order("created_at", { ascending: false }).limit(200);
  const ids = (parr || []).map((p) => p.workspace_id);
  let filleuls = [];
  if (ids.length) {
    const [{ data: ws }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("workspaces").select("id, name, country").in("id", ids),
      supabaseAdmin.from("subscriptions").select("workspace_id, status, trial_ends_at").in("workspace_id", ids),
    ]);
    filleuls = (parr || []).map((p) => {
      const w = (ws || []).find((x) => x.id === p.workspace_id);
      const s = (subs || []).find((x) => x.workspace_id === p.workspace_id);
      const etat = s?.status === "active" ? "abonné" : s?.status === "trial" ? "en essai" : "inscrit";
      return { nom: w?.name || "Boutique", pays: w?.country || null, etat, depuis: p.created_at };
    });
  }
  const { data: commissions } = await supabaseAdmin.from("ambassadeur_commissions").select("montant, devise, statut, created_at").eq("ambassadeur_id", amb.id).order("created_at", { ascending: false }).limit(500);
  return {
    code: amb.code,
    nom: amb.nom,
    contact_paiement: amb.contact_paiement || "",
    lien: `${urlApp()}/?amb=${amb.code}`,
    taux: tauxAmbassadeur(),
    mois: moisAmbassadeur(),
    filleuls,
    totaux: totaux(commissions || []),
    nb_commissions: (commissions || []).length,
  };
}

async function ambassadeurLier(user, workspaceId, code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  if (!c || !UUID.test(String(workspaceId || ""))) return { ok: false };
  const { data: ws } = await supabaseAdmin.from("workspaces").select("id, owner_id, created_at").eq("id", workspaceId).maybeSingle();
  if (!ws || ws.owner_id !== user.id) return { ok: false };
  if (Date.now() - new Date(ws.created_at).getTime() > 14 * 24 * 3600 * 1000) return { ok: false, raison: "espace trop ancien" };
  const { data: amb } = await supabaseAdmin.from("ambassadeurs").select("id, user_id").eq("code", c).maybeSingle();
  if (!amb || amb.user_id === user.id) return { ok: false };
  const { error } = await supabaseAdmin.from("ambassadeur_parrainages").insert([{ workspace_id: ws.id, ambassadeur_id: amb.id }]);
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false };
  return { ok: true };
}

// Appelée par le webhook Chariow après CHAQUE vente d'abonnement (jamais pour les packs de crédits IA).
export async function enregistrerCommission({ workspaceId, venteRef, montantVente, devise }) {
  try {
    const { data: parr } = await supabaseAdmin.from("ambassadeur_parrainages").select("ambassadeur_id").eq("workspace_id", workspaceId).maybeSingle();
    if (!parr) return { commission: false };
    const taux = tauxAmbassadeur();
    const montantBase = Number(montantVente) || 0;
    if (taux <= 0 || montantBase <= 0) return { commission: false };
    const { count } = await supabaseAdmin.from("ambassadeur_commissions").select("id", { count: "exact", head: true }).eq("ambassadeur_id", parr.ambassadeur_id).eq("workspace_id", workspaceId);
    if ((count || 0) >= moisAmbassadeur()) return { commission: false, raison: "durée maximale atteinte" };
    const { error } = await supabaseAdmin.from("ambassadeur_commissions").insert([{
      ambassadeur_id: parr.ambassadeur_id, workspace_id: workspaceId, vente_ref: String(venteRef).slice(0, 120),
      montant_vente: montantBase, devise: devise || "XOF", taux, montant: Math.round((montantBase * taux) / 100),
    }]);
    if (error) return { commission: false, raison: /duplicate|unique/i.test(error.message) ? "déjà enregistrée" : error.message };
    return { commission: true };
  } catch (e) {
    return { commission: false, raison: e.message };
  }
}

async function ambassadeursAdmin() {
  const { data: ambs } = await supabaseAdmin.from("ambassadeurs").select("*").order("created_at", { ascending: false }).limit(500);
  const { data: comms } = await supabaseAdmin.from("ambassadeur_commissions").select("ambassadeur_id, montant, devise, statut").limit(5000);
  const { data: parr } = await supabaseAdmin.from("ambassadeur_parrainages").select("ambassadeur_id").limit(5000);
  const emails = {};
  await Promise.all((ambs || []).slice(0, 60).map(async (a) => {
    try { const { data } = await supabaseAdmin.auth.admin.getUserById(a.user_id); emails[a.id] = data?.user?.email || null; } catch (_) {}
  }));
  return (ambs || []).map((a) => ({
    id: a.id, nom: a.nom, code: a.code, email: emails[a.id] || null, contact_paiement: a.contact_paiement || "",
    filleuls: (parr || []).filter((p) => p.ambassadeur_id === a.id).length,
    totaux: totaux((comms || []).filter((c) => c.ambassadeur_id === a.id)),
  })).sort((x, y) => Object.values(y.totaux.due).reduce((s, n) => s + n, 0) - Object.values(x.totaux.due).reduce((s, n) => s + n, 0));
}

// ---------- Annuaire ----------
async function annuaireEtat(workspaceId) {
  const v = (await lireOption(workspaceId, "annuaire")) || {};
  const { data: ws } = await supabaseAdmin.from("workspaces").select("slug, store_is_published").eq("id", workspaceId).maybeSingle();
  return {
    actif: !!v.actif,
    categorie: CATEGORIES_ANNUAIRE.includes(v.categorie) ? v.categorie : "Autre",
    description: String(v.description || ""),
    eligible: !!(ws?.slug && ws?.store_is_published),
    a_la_une_jusqua: v.a_la_une_jusqua || null,
  };
}

async function annuaireEnregistrer(workspaceId, corps) {
  const ancien = (await lireOption(workspaceId, "annuaire")) || {};
  const actif = !!corps.actif;
  if (actif) {
    const { data: ws } = await supabaseAdmin.from("workspaces").select("slug, store_is_published").eq("id", workspaceId).maybeSingle();
    if (!ws?.slug || !ws?.store_is_published) throw new Error("Publie d'abord ta boutique pour apparaître dans l'annuaire.");
  }
  await ecrireOption(workspaceId, "annuaire", {
    ...ancien,
    actif,
    categorie: CATEGORIES_ANNUAIRE.includes(corps.categorie) ? corps.categorie : "Autre",
    description: String(corps.description || "").replace(/<[^>]*>/g, "").slice(0, 160),
  });
  return annuaireEtat(workspaceId);
}

const cacheAnnuaire = { t: 0, v: null };

async function listeAnnuaire() {
  if (cacheAnnuaire.v && Date.now() - cacheAnnuaire.t < 5 * 60 * 1000) return cacheAnnuaire.v;
  const { data: opts } = await supabaseAdmin.from("workspace_options").select("workspace_id, valeur").eq("cle", "annuaire").eq("valeur->>actif", "true").limit(1000);
  const ids = (opts || []).map((o) => o.workspace_id);
  if (ids.length === 0) { cacheAnnuaire.t = Date.now(); cacheAnnuaire.v = []; return []; }
  const [{ data: ws }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("workspaces").select("id, name, slug, logo_url, country, description_boutique, store_is_published, domaine_personnalise").in("id", ids).eq("store_is_published", true).not("slug", "is", null),
    supabaseAdmin.from("subscriptions").select("workspace_id, status, trial_ends_at").in("workspace_id", ids),
  ]);
  const maintenant = Date.now();
  const liste = [];
  for (const w of ws || []) {
    const s = (subs || []).find((x) => x.workspace_id === w.id);
    const actif = s && (s.status === "active" || (s.status === "trial" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > maintenant));
    if (!actif) continue;
    const o = (opts || []).find((x) => x.workspace_id === w.id)?.valeur || {};
    liste.push({
      nom: w.name, slug: w.slug, logo: w.logo_url || null, pays: w.country || null,
      categorie: CATEGORIES_ANNUAIRE.includes(o.categorie) ? o.categorie : "Autre",
      description: String(o.description || w.description_boutique || "").replace(/<[^>]*>/g, "").slice(0, 160),
      a_la_une: !!(o.a_la_une_jusqua && new Date(o.a_la_une_jusqua).getTime() > maintenant),
    });
  }
  liste.sort((a, b) => Number(b.a_la_une) - Number(a.a_la_une) || String(a.nom).localeCompare(String(b.nom)));
  cacheAnnuaire.t = maintenant; cacheAnnuaire.v = liste;
  return liste;
}

export async function repondreAnnuaire(req, res) {
  if (tropDeRequetes(ipDe(req), "annuaire", 60)) return res.status(429).json({ error: "Trop de requêtes" });
  try {
    const liste = await listeAnnuaire();
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ boutiques: liste, categories: CATEGORIES_ANNUAIRE });
  } catch (e) {
    return res.status(200).json({ boutiques: [], categories: CATEGORIES_ANNUAIRE });
  }
}

// Paramètres publics du programme (pour les calculateurs de la page « Outils ») : vrais prix des plans, aucun chiffre inventé.
export async function repondreCroissance(req, res) {
  if (tropDeRequetes(ipDe(req), "croissance", 60)) return res.status(429).json({ error: "Trop de requêtes" });
  const { data: plans } = await supabaseAdmin.from("subscription_plans").select("nom, prix, devise").not("chariow_product_id", "is", null).order("prix", { ascending: true }).limit(10);
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
  return res.status(200).json({
    ambassadeur: { taux: tauxAmbassadeur(), mois: moisAmbassadeur() },
    plans: (plans || []).filter((p) => Number(p.prix) > 0).map((p) => ({ nom: p.nom, prix: Number(p.prix), devise: p.devise || "XOF" })),
  });
}

// ---------- Aiguillage des actions (appelé depuis api/admin-panel.js) ----------
export const ACTIONS_CROISSANCE = new Set([
  "paiement_config_lire", "paiement_config_enregistrer", "paiement_config_tester",
  "options_lire", "options_enregistrer", "reseau_verifier",
  "amb_moi", "amb_infos", "amb_lier",
  "amb_admin_liste", "amb_admin_payer", "annuaire_admin_liste", "annuaire_une",
]);

async function authentifier(req, res) {
  const token = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Non authentifié" }); return null; }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: "Session invalide" }); return null; }
  return data.user;
}

const estProprietaireRecuVente = (user) =>
  !!process.env.RECUVENTE_ADMIN_EMAIL && String(user.email || "").trim().toLowerCase() === process.env.RECUVENTE_ADMIN_EMAIL.trim().toLowerCase();

export async function traiterAction(req, res) {
  const corps = req.body || {};
  const action = corps.action;
  const user = await authentifier(req, res);
  if (!user) return;
  try {
    // --- Ambassadeur (n'importe quel utilisateur connecté) ---
    if (action === "amb_moi") return res.status(200).json(await ambassadeurMoi(user));
    if (action === "amb_lier") return res.status(200).json(await ambassadeurLier(user, corps.workspace_id, corps.code));
    if (action === "amb_infos") {
      const amb = await ambassadeurDe(user, true);
      await supabaseAdmin.from("ambassadeurs").update({
        nom: String(corps.nom || amb.nom || "").slice(0, 80),
        contact_paiement: String(corps.contact_paiement || "").slice(0, 200),
      }).eq("id", amb.id);
      return res.status(200).json(await ambassadeurMoi(user));
    }

    // --- Propriétaire RecuVente ---
    if (action === "amb_admin_liste" || action === "amb_admin_payer" || action === "annuaire_admin_liste" || action === "annuaire_une") {
      if (!estProprietaireRecuVente(user)) return res.status(403).json({ error: "Accès réservé à l'administrateur RecuVente" });
      if (action === "amb_admin_liste") return res.status(200).json({ ambassadeurs: await ambassadeursAdmin(), taux: tauxAmbassadeur(), mois: moisAmbassadeur() });
      if (action === "amb_admin_payer") {
        if (!UUID.test(String(corps.ambassadeur_id || ""))) return res.status(400).json({ error: "Ambassadeur invalide" });
        const { data } = await supabaseAdmin.from("ambassadeur_commissions").update({ statut: "payee", payee_at: new Date().toISOString() }).eq("ambassadeur_id", corps.ambassadeur_id).eq("statut", "due").select("id");
        return res.status(200).json({ ok: true, commissions_payees: (data || []).length });
      }
      if (action === "annuaire_admin_liste") {
        const { data: opts } = await supabaseAdmin.from("workspace_options").select("workspace_id, valeur").eq("cle", "annuaire").limit(1000);
        const ids = (opts || []).filter((o) => o.valeur?.actif).map((o) => o.workspace_id);
        const { data: ws } = ids.length ? await supabaseAdmin.from("workspaces").select("id, name").in("id", ids) : { data: [] };
        return res.status(200).json({
          boutiques: (ws || []).map((w) => ({ id: w.id, nom: w.name, a_la_une_jusqua: (opts || []).find((o) => o.workspace_id === w.id)?.valeur?.a_la_une_jusqua || null })),
        });
      }
      if (action === "annuaire_une") {
        if (!UUID.test(String(corps.cible_id || ""))) return res.status(400).json({ error: "Boutique invalide" });
        const jours = Math.max(0, Math.min(365, Math.round(Number(corps.jours) || 0)));
        const ancien = (await lireOption(corps.cible_id, "annuaire")) || {};
        await ecrireOption(corps.cible_id, "annuaire", { ...ancien, a_la_une_jusqua: jours > 0 ? new Date(Date.now() + jours * 24 * 3600 * 1000).toISOString() : null });
        cacheAnnuaire.v = null;
        return res.status(200).json({ ok: true });
      }
    }

    // --- Actions d'une boutique : il faut en être membre ---
    const wsId = corps.workspace_id;
    if (!UUID.test(String(wsId || ""))) return res.status(400).json({ error: "Espace de travail manquant" });
    const role = await roleMembre(user.id, wsId);
    if (!role) return res.status(403).json({ error: "Accès refusé à cet espace de travail" });

    if (ACTIONS_MARCHAND_PAIEMENT.has(action)) {
      const r = await actionMarchand(action, corps, user);
      return res.status(r.statut).json(r.corps);
    }
    if (action === "reseau_verifier") {
      if (tropDeRequetes(user.id, "reseau", 30)) return res.status(429).json({ error: "Trop de requêtes" });
      return res.status(200).json(await reseauVerifier(wsId, corps.telephones));
    }
    if (action === "options_lire") {
      return res.status(200).json({ reseau: { actif: await reseauActif(wsId) }, annuaire: await annuaireEtat(wsId), categories: CATEGORIES_ANNUAIRE });
    }
    if (action === "options_enregistrer") {
      if (role !== "owner" && role !== "admin") return res.status(403).json({ error: "Réservé au propriétaire de la boutique." });
      if (typeof corps.reseau_actif === "boolean") await ecrireOption(wsId, "reseau_anti_refus", { actif: corps.reseau_actif });
      if (corps.annuaire && typeof corps.annuaire === "object") { await annuaireEnregistrer(wsId, corps.annuaire); cacheAnnuaire.v = null; }
      return res.status(200).json({ reseau: { actif: await reseauActif(wsId) }, annuaire: await annuaireEtat(wsId), categories: CATEGORIES_ANNUAIRE });
    }
    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Erreur" });
  }
}
