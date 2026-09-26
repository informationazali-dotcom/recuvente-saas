import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { lireOption, ecrireOption } from "../lib/options.js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const SEUIL_ALERTE = 5;

function parseProduitTexte(texte) {
  if (!texte) return { nom: "", quantite: 1 };
  const match = texte.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
  if (match) return { nom: match[1].trim(), quantite: Number(match[2]) || 1 };
  return { nom: texte.trim(), quantite: 1 };
}

// Exécute une liste de tâches asynchrones avec un nombre limité en parallèle,
// au lieu d'une par une (séquentiel) ou toutes en même temps (risque de surcharge).
// Indispensable pour rester dans le temps d'exécution autorisé quand le nombre
// de boutiques grandit — sans ça, 1000 boutiques en séquentiel peut largement
// dépasser la limite de temps d'une fonction serverless et s'arrêter en plein milieu.
async function executerParLots(taches, tailleLot = 15) {
  const resultats = [];
  for (let i = 0; i < taches.length; i += tailleLot) {
    const lot = taches.slice(i, i + tailleLot);
    const resultatsLot = await Promise.allSettled(lot.map((tache) => tache()));
    resultats.push(...resultatsLot);
  }
  return resultats;
}

// Journal d'audit (table déjà existante, utilisée jusqu'ici par api/team.js pour les actions RH).
// Étendue ici au Problem Engine : chaque détection automatique (montrée à un marchand) écrit une
// ligne, et chaque résolution constatée au run suivant en écrit une autre — c'est le maillon
// "Résultat" qui manquait pour mesurer, plus tard, si une alerte a vraiment changé quelque chose.
// Jamais bloquant : une panne d'écriture ici ne doit jamais empêcher le reste du cron de tourner.
async function tracerAudit(workspaceId, action, details) {
  try {
    await supabaseAdmin.from("journal_audit").insert([{
      workspace_id: workspaceId,
      action,
      details: typeof details === "string" ? details : JSON.stringify(details || {}),
      effectue_par: "Système (détection automatique)",
    }]);
  } catch (e) {
    console.error("Erreur journal d'audit (non bloquant) :", e.message);
  }
}

async function sauvegarderQuotidiennement() {
  try {
    const tables = ["workspaces", "commandes", "produits", "avis_produits", "collections", "collection_produits", "workspace_members"];
    const sauvegarde = {};
    for (const table of tables) {
      const { data } = await supabaseAdmin.from(table).select("*");
      sauvegarde[table] = data || [];
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const contenu = JSON.stringify(sauvegarde);
    await supabaseAdmin.storage
      .from("sauvegardes")
      .upload(`sauvegarde-${dateStr}.json`, contenu, { contentType: "application/json", upsert: true });

    const { data: fichiers } = await supabaseAdmin.storage.from("sauvegardes").list();
    if (fichiers && fichiers.length > 14) {
      const aSupprimer = fichiers.sort((a, b) => a.name.localeCompare(b.name)).slice(0, fichiers.length - 14).map((f) => f.name);
      if (aSupprimer.length > 0) await supabaseAdmin.storage.from("sauvegardes").remove(aSupprimer);
    }
    return true;
  } catch (e) {
    console.error("Erreur sauvegarde quotidienne:", e);
    return false;
  }
}

async function verifierEssaisEtRappels() {
  const dansDeuxJours = new Date();
  dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  const dansUnJour = new Date();
  dansUnJour.setDate(dansUnJour.getDate() + 1);

  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, workspace_id, trial_ends_at, status, rappel_envoye, workspaces(name, owner_id)")
    .eq("status", "trial")
    .eq("rappel_envoye", false)
    .lte("trial_ends_at", dansDeuxJours.toISOString())
    .gte("trial_ends_at", dansUnJour.toISOString());

  if (error) return { envoyes: 0, essaisExpiresAujourdhui: 0, notifAdminEnvoyee: false, erreur: error.message };

  let envoyes = 0;
  if (subs && subs.length > 0) {
    const taches = subs.map((sub) => async () => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(sub.workspaces.owner_id);
      const email = userData?.user?.email;
      if (!email) return;
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: email,
        subject: `Ton accès RecuVente se termine bientôt — ${sub.workspaces.name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #e8920a; font-size: 20px;">⏳ Plus que 2 jours</h1>
            <p style="color: #16231F; font-size: 15px; line-height: 1.6;">
              Ton accès sur <strong>${sub.workspaces.name}</strong> se termine dans 2 jours. Choisis un plan pour continuer à utiliser tes commandes sans interruption.
            </p>
            <a href="https://recuvente-saas.vercel.app" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
              Choisir mon plan
            </a>
          </div>
        `,
      });
      await supabaseAdmin.from("subscriptions").update({ rappel_envoye: true }).eq("id", sub.id);
      envoyes++;
    });
    await executerParLots(taches);
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);

  const { data: essaisExpires } = await supabaseAdmin
    .from("subscriptions")
    .select("id, trial_ends_at, workspaces(name)")
    .eq("status", "trial")
    .gte("trial_ends_at", hier.toISOString())
    .lt("trial_ends_at", aujourdhui.toISOString());

  let notifAdminEnvoyee = false;
  if (essaisExpires && essaisExpires.length > 0 && process.env.RECUVENTE_ADMIN_EMAIL) {
    try {
      const listeEntreprises = essaisExpires.map((s) => `<li>${s.workspaces.name}</li>`).join("");
      await resend.emails.send({
        from: "RecuVente <onboarding@resend.dev>",
        to: process.env.RECUVENTE_ADMIN_EMAIL,
        subject: `📋 ${essaisExpires.length} essai${essaisExpires.length > 1 ? "s" : ""} gratuit${essaisExpires.length > 1 ? "s" : ""} terminé${essaisExpires.length > 1 ? "s" : ""} aujourd'hui`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #16231F; font-size: 18px;">📋 Essais gratuits terminés aujourd'hui</h1>
            <p style="color: #6B7168; font-size: 14px;">Ces entreprises ne peuvent plus ajouter de commandes tant qu'elles ne passent pas à un plan payant :</p>
            <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">${listeEntreprises}</ul>
            <a href="https://recuvente-saas.vercel.app/?admin=1" style="display: inline-block; background: #1a7a3c; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
              Voir le panneau Admin
            </a>
          </div>
        `,
      });
      notifAdminEnvoyee = true;
    } catch (e) {
      console.error("Erreur notification admin:", e);
    }
  }

  return { envoyes, essaisExpiresAujourdhui: essaisExpires?.length || 0, notifAdminEnvoyee };
}

async function verifierStockBas() {
  // Requêtes en masse (2 requêtes au total), plutôt qu'une paire de requêtes
  // par boutique — c'est ce qui permet de rester rapide même à 1000 boutiques.
  const { data: workspaces, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name, owner_id");
  if (wsError) return { alertesEnvoyees: 0, erreur: wsError.message };
  if (!workspaces || workspaces.length === 0) return { alertesEnvoyees: 0 };

  const { data: tousLesProduits } = await supabaseAdmin.from("produits").select("*");
  const { data: toutesLesCommandes } = await supabaseAdmin
    .from("commandes")
    .select("workspace_id, produit, statut")
    .neq("statut", "echouee");

  const produitsParWorkspace = {};
  (tousLesProduits || []).forEach((p) => {
    if (!produitsParWorkspace[p.workspace_id]) produitsParWorkspace[p.workspace_id] = [];
    produitsParWorkspace[p.workspace_id].push(p);
  });

  const quantitesEngageesParWorkspace = {};
  (toutesLesCommandes || []).forEach((c) => {
    const { nom, quantite } = parseProduitTexte(c.produit);
    if (!nom) return;
    if (!quantitesEngageesParWorkspace[c.workspace_id]) quantitesEngageesParWorkspace[c.workspace_id] = {};
    quantitesEngageesParWorkspace[c.workspace_id][nom] = (quantitesEngageesParWorkspace[c.workspace_id][nom] || 0) + quantite;
  });

  let alertesEnvoyees = 0;
  const produitsAMettreAJour = [];

  const taches = workspaces.map((ws) => async () => {
    const produits = produitsParWorkspace[ws.id];
    if (!produits || produits.length === 0) return;
    const quantitesEngagees = quantitesEngageesParWorkspace[ws.id] || {};

    const produitsBas = [];
    for (const p of produits) {
      const stock = Number(p.stock_initial || 0);
      if (stock <= 0) continue;
      const engage = quantitesEngagees[p.nom] || 0;
      const restant = stock - engage;
      const dejaAlerteRecemment = p.derniere_alerte_stock && (Date.now() - new Date(p.derniere_alerte_stock).getTime()) < 3 * 24 * 3600 * 1000;
      if (restant <= SEUIL_ALERTE && !dejaAlerteRecemment) {
        produitsBas.push({ ...p, restant });
      }
    }
    if (produitsBas.length === 0) return;

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
    const email = userData?.user?.email;
    if (!email) return;

    await resend.emails.send({
      from: "RecuVente <onboarding@resend.dev>",
      to: email,
      subject: `⚠️ Stock bas — ${produitsBas.length} produit${produitsBas.length > 1 ? "s" : ""} à réapprovisionner`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #D64933; font-size: 20px;">⚠️ Stock bientôt épuisé — ${ws.name}</h1>
          <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">
            ${produitsBas.map((p) => `<li><strong>${p.nom}</strong> — ${p.restant <= 0 ? "épuisé" : `${p.restant} restant${p.restant > 1 ? "s" : ""}`}</li>`).join("")}
          </ul>
          <a href="https://recuvente-saas.vercel.app" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
            Gérer mon stock
          </a>
        </div>
      `,
    });
    produitsBas.forEach((p) => produitsAMettreAJour.push(p.id));
    alertesEnvoyees++;
  });

  await executerParLots(taches);

  // Une seule requête groupée pour marquer toutes les alertes envoyées,
  // au lieu d'une requête par produit.
  if (produitsAMettreAJour.length > 0) {
    await supabaseAdmin.from("produits").update({ derniere_alerte_stock: new Date().toISOString() }).in("id", produitsAMettreAJour);
  }

  return { alertesEnvoyees };
}

// Dépôt de caisse en retard : le tableau de bord Comptabilité affiche déjà un badge "Écart de
// caisse" (dépôt déclaré par le livreur vs montant attendu, voir LivreurCarteEcartCaisse dans
// App.jsx), mais c'est un signal PASSIF — il faut ouvrir l'écran et cliquer sur le bon livreur
// pour le voir, et il ne s'affiche même pas tant qu'aucun dépôt n'a jamais été déclaré (silence,
// pas alerte, dans le pire des cas : un livreur qui ne déclare jamais rien). Ici, on prévient
// PAR EMAIL — une fois tous les 3 jours par boutique, comme l'alerte stock bas — dès qu'un
// livreur a un montant significatif à déposer (commandes confirmées, encaissé en espèces moins
// sa commission — même calcul que "depotsParLivreur" dans App.jsx) sans aucun dépôt déclaré
// dans la fenêtre. Purement additif : ne crée ni ne modifie aucune commande, aucun dépôt,
// aucune donnée existante — se contente de lire ce qui existe déjà et d'envoyer un email.
const FENETRE_JOURS_CAISSE = 7;

function estLivraisonFacturableCaisse(c, activityType) {
  if (activityType === "location_immobiliere" || activityType === "location_vehicule") return false;
  if (activityType === "restaurant") return c.type_commande === "livraison";
  return c.mode_vente === "livraison" || c.mode_vente === "expedition";
}

function tarifPourCommandeCaisse(c, defaut, zones, livreurTarifs) {
  const cleLivreur = String(c.livreur || "").trim().toLowerCase();
  const tl = cleLivreur ? livreurTarifs.find((t) => String(t.livreur_nom || "").trim().toLowerCase() === cleLivreur) : null;
  if (tl) return Number(tl.montant);
  const cleZone = String(c.zone || "").trim().toLowerCase();
  const tz = cleZone ? zones.find((z) => String(z.zone || "").trim().toLowerCase() === cleZone) : null;
  if (tz) return Number(tz.montant);
  return defaut;
}

// Fenêtre de lecture du journal d'audit pour retrouver les détections encore "en attente"
// (pas encore résolues) — plus large que FENETRE_JOURS_CAISSE, qui ne sert qu'au calcul du
// montant à déposer. 30 jours suffit largement à couvrir le cycle normal d'un livreur.
const FENETRE_JOURS_RESOLUTION_CAISSE = 30;

async function verifierEcartsCaisse() {
  const depuis = new Date(Date.now() - FENETRE_JOURS_CAISSE * 24 * 3600 * 1000).toISOString();
  const depuisAudit = new Date(Date.now() - FENETRE_JOURS_RESOLUTION_CAISSE * 24 * 3600 * 1000).toISOString();

  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, owner_id, activity_type, currency");
  if (wsError) return { alertesEnvoyees: 0, erreur: wsError.message };
  if (!workspaces || workspaces.length === 0) return { alertesEnvoyees: 0 };

  const [{ data: livreurs }, { data: commandes }, { data: paiements }, { data: reglages }, { data: zonesTarifs }, { data: livreurTarifs }, { data: depots }, { data: auditCaisse }] = await Promise.all([
    supabaseAdmin.from("livreurs").select("workspace_id, nom"),
    supabaseAdmin.from("commandes").select("id, workspace_id, montant, livreur, zone, mode_vente, type_commande").eq("statut", "confirmee").gte("created_at", depuis),
    supabaseAdmin.from("paiements_en_ligne").select("workspace_id, commande_id, montant_paye").eq("statut", "paye"),
    supabaseAdmin.from("reglages_livraison").select("workspace_id, tarif_defaut"),
    supabaseAdmin.from("tarifs_zone_livraison").select("workspace_id, zone, montant"),
    supabaseAdmin.from("tarifs_livreur_livraison").select("workspace_id, livreur_nom, montant"),
    supabaseAdmin.from("depots_livreur").select("workspace_id, livreur_nom, created_at").gte("created_at", depuis),
    supabaseAdmin.from("journal_audit").select("workspace_id, action, details, created_at").in("action", ["ecart_caisse_detecte", "ecart_caisse_resolu"]).gte("created_at", depuisAudit).order("created_at", { ascending: true }),
  ]);

  const parWorkspace = (arr, cle = "workspace_id") => {
    const m = {};
    (arr || []).forEach((x) => { (m[x[cle]] ||= []).push(x); });
    return m;
  };
  const livreursParWs = parWorkspace(livreurs);
  const commandesParWs = parWorkspace(commandes);
  const paiementsParWs = parWorkspace(paiements);
  const zonesParWs = parWorkspace(zonesTarifs);
  const livreurTarifsParWs = parWorkspace(livreurTarifs);
  const depotsParWs = parWorkspace(depots);
  const reglagesParWs = {};
  (reglages || []).forEach((r) => { reglagesParWs[r.workspace_id] = r; });

  // Rejoue le journal (dans l'ordre chronologique) pour reconstruire, par boutique, l'ensemble
  // des livreurs "détectés mais pas encore résolus" — c'est le maillon Résultat du Problem
  // Engine (partie 15 du Blueprint) : sans cette lecture, personne ne sait si une alerte a fini
  // par se résoudre ou non.
  const enAttenteParWs = {};
  (auditCaisse || []).forEach((ligne) => {
    let d = {};
    try { d = JSON.parse(ligne.details || "{}"); } catch (_) { d = {}; }
    const bucket = (enAttenteParWs[ligne.workspace_id] ||= {});
    if (ligne.action === "ecart_caisse_detecte") {
      (d.livreurs || []).forEach((l) => {
        const cle = String(l.nom || "").trim().toLowerCase();
        if (cle) bucket[cle] = { nom: l.nom, depuisLe: ligne.created_at };
      });
    } else if (ligne.action === "ecart_caisse_resolu") {
      const cle = String(d.nom || "").trim().toLowerCase();
      if (cle) delete bucket[cle];
    }
  });

  let alertesEnvoyees = 0;
  let resolutionsDetectees = 0;

  const taches = workspaces.map((ws) => async () => {
    const mesLivreurs = livreursParWs[ws.id] || [];
    const mesCommandes = commandesParWs[ws.id] || [];

    const mesPaiements = {};
    (paiementsParWs[ws.id] || []).forEach((p) => { mesPaiements[p.commande_id] = (mesPaiements[p.commande_id] || 0) + Number(p.montant_paye || 0); });
    const tarifDefaut = reglagesParWs[ws.id]?.tarif_defaut != null ? Number(reglagesParWs[ws.id].tarif_defaut) : 1500;
    const mesDepots = depotsParWs[ws.id] || [];
    const zones = zonesParWs[ws.id] || [];
    const livreurTarifsWs = livreurTarifsParWs[ws.id] || [];

    const aRisque = (mesLivreurs.length === 0 || mesCommandes.length === 0) ? [] : mesLivreurs
      .map((l) => {
        const mesLivrees = mesCommandes.filter((c) => c.livreur === l.nom);
        if (mesLivrees.length === 0) return null;
        const montantRecupere = mesLivrees.reduce((s, c) => {
          const paye = Math.min(Number(c.montant), mesPaiements[c.id] || 0);
          return s + Math.max(0, Number(c.montant) - paye);
        }, 0);
        const commission = mesLivrees.reduce((s, c) => s + (estLivraisonFacturableCaisse(c, ws.activity_type) ? tarifPourCommandeCaisse(c, tarifDefaut, zones, livreurTarifsWs) : 0), 0);
        const aDeposer = montantRecupere - commission;
        const declareRecemment = mesDepots.some((d) => String(d.livreur_nom || "").trim().toLowerCase() === String(l.nom || "").trim().toLowerCase());
        return { nom: l.nom, aDeposer, declareRecemment };
      })
      .filter((l) => l && l.aDeposer > Math.max(1000, tarifDefaut * 2) && !l.declareRecemment);

    // Résolution : un livreur détecté lors d'un run précédent et qui n'apparaît plus dans
    // aRisque aujourd'hui (dépôt déclaré depuis, ou plus de commandes à risque) est résolu —
    // qu'un nouvel email soit envoyé ou non ce jour-là.
    const pendantes = enAttenteParWs[ws.id] || {};
    const nomsFlagges = new Set(aRisque.map((l) => String(l.nom || "").trim().toLowerCase()));
    for (const [cle, info] of Object.entries(pendantes)) {
      if (!nomsFlagges.has(cle)) {
        const jours = Math.max(0, Math.round((Date.now() - new Date(info.depuisLe).getTime()) / (24 * 3600 * 1000)));
        await tracerAudit(ws.id, "ecart_caisse_resolu", { nom: info.nom, jours_ecoules: jours });
        resolutionsDetectees++;
      }
    }

    if (aRisque.length === 0) return;

    const opt = await lireOption(ws.id, "derniere_alerte_caisse");
    if (opt?.at && Date.now() - new Date(opt.at).getTime() < 3 * 24 * 3600 * 1000) return;

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
    const email = userData?.user?.email;
    if (!email) return;

    const devise = ws.currency || "";
    await resend.emails.send({
      from: "RecuVente <onboarding@resend.dev>",
      to: email,
      subject: `🧾 Dépôt de caisse en retard — ${aRisque.length} livreur${aRisque.length > 1 ? "s" : ""} à contrôler`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #D64933; font-size: 20px;">🧾 Dépôt de caisse en retard — ${ws.name}</h1>
          <p style="color: #6B7168; font-size: 14px;">Ces livreurs ont de l'argent à déposer (commandes livrées des ${FENETRE_JOURS_CAISSE} derniers jours), sans aucun dépôt déclaré récemment :</p>
          <ul style="color: #16231F; font-size: 14px; line-height: 1.8;">
            ${aRisque.map((l) => `<li><strong>${l.nom}</strong> — environ ${Math.round(l.aDeposer).toLocaleString("fr-FR")} ${devise} à déposer</li>`).join("")}
          </ul>
          <p style="color: #8A9089; font-size: 12px;">Montant estimé automatiquement — vérifie le détail exact dans Comptabilité avant d'agir.</p>
          <a href="https://recuvente-saas.vercel.app" style="display: inline-block; background: #1a7a3c; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 10px;">
            Vérifier dans Comptabilité
          </a>
        </div>
      `,
    });
    await ecrireOption(ws.id, "derniere_alerte_caisse", { at: new Date().toISOString() });
    await tracerAudit(ws.id, "ecart_caisse_detecte", { livreurs: aRisque.map((l) => ({ nom: l.nom, a_deposer: Math.round(l.aDeposer) })) });
    alertesEnvoyees++;
  });

  await executerParLots(taches);
  return { alertesEnvoyees, resolutionsDetectees };
}

// Secteurs et villes qui correspondent réellement au profil de client idéal
// de RecuVente (COD, gestion manuelle par WhatsApp/Instagram, PME africaines).
const SECTEURS_CIBLES = [
  "boutiques de vêtements sur Instagram",
  "vendeurs de cosmétiques et produits de beauté sur WhatsApp",
  "boutiques d'électronique et téléphones",
  "restaurants avec livraison à domicile",
  "vendeurs de chaussures et accessoires",
  "boutiques de produits pour bébés et enfants",
  "magasins de pièces automobiles",
  "vendeurs de produits capillaires et perruques",
  "boutiques en ligne sans vraie plateforme de vente",
  "entreprises de livraison à domicile",
  "vendeurs de compléments alimentaires et bien-être",
  "boutiques de décoration et maison",
];
const VILLES_CIBLES = ["Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Korhogo", "Daloa"];

function tirerAuSort(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

// Toutes les combinaisons secteur×ville possibles, dans un ordre fixe — sert à tourner
// systématiquement dessus (round-robin) plutôt qu'au hasard, pour ne pas re-chercher 10 fois
// la même combinaison pendant qu'une autre n'est jamais essayée. L'ordre lui-même est mélangé
// une fois au chargement (pas à chaque exécution), donc stable d'un run à l'autre.
const TOUTES_COMBINAISONS = SECTEURS_CIBLES.flatMap((secteur) => VILLES_CIBLES.map((ville) => ({ secteur, ville })));

async function prochainesCombinaisons(nombre) {
  // Le curseur est stocké dans ai_memory (créée en Phase A) — mémoire partagée entre agents,
  // donc l'agent Prospection s'en sert exactement pour ce qu'elle est faite.
  const { data: memoire } = await supabaseAdmin
    .from("ai_memory")
    .select("value")
    .eq("proprietaire_email", "oulipaiexpress@gmail.com")
    .eq("scope", "prospecting")
    .eq("key", "cursor_combinaison")
    .maybeSingle();
  const indexDepart = memoire?.value?.index || 0;

  const combinaisons = [];
  for (let i = 0; i < nombre; i++) {
    combinaisons.push(TOUTES_COMBINAISONS[(indexDepart + i) % TOUTES_COMBINAISONS.length]);
  }
  const nouvelIndex = (indexDepart + nombre) % TOUTES_COMBINAISONS.length;
  await supabaseAdmin.from("ai_memory").upsert(
    [{ proprietaire_email: "oulipaiexpress@gmail.com", scope: "prospecting", key: "cursor_combinaison", value: { index: nouvelIndex }, updated_at: new Date().toISOString() }],
    { onConflict: "proprietaire_email,scope,key" }
  );
  return combinaisons;
}

async function chercherProspectsAvecClaude(secteur, ville) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { inseres: 0, erreur: "ANTHROPIC_API_KEY manquante" };

  const prompt = `Tu es un agent de recherche commerciale pour RecuVente, une plateforme de gestion de boutique en ligne et paiement à la livraison pour l'Afrique de l'Ouest (abonnement à 9 500 FCFA/mois : création de boutique en ligne, gestion des commandes, des livreurs, des clients, du stock, marketing WhatsApp).

Cherche sur le web 5 entreprises RÉELLES et VÉRIFIABLES dans le secteur "${secteur}" à ${ville}, Côte d'Ivoire, qui semblent gérer leurs ventes de façon manuelle (WhatsApp, Instagram, sans vraie boutique en ligne) et pourraient bénéficier de RecuVente.

Pour CHAQUE entreprise trouvée, réponds uniquement avec un objet JSON dans un tableau, avec ces champs exacts :
{
  "nom": "nom du compte/entreprise",
  "secteur": "...",
  "ville": "...",
  "site_web_ou_reseau": "URL réelle trouvée",
  "telephone_whatsapp": "numéro de téléphone/WhatsApp trouvé publiquement (au format international, ex: 2250700000000), ou vide si introuvable",
  "probleme_identifie": "ce qui suggère qu'ils géreraient mieux avec RecuVente",
  "score": nombre de 0 à 100 selon le potentiel,
  "message_suggere": "message court, humain, personnalisé en français ivoirien, présentant RecuVente et son prix, adapté à ce prospect précis"
}

Ne réponds QUE le tableau JSON, sans texte autour. N'invente aucune entreprise — n'utilise que des résultats de recherche réels.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return { inseres: 0, erreur: data?.error?.message || "Erreur API Claude" };

    const texteReponse = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const matchJSON = texteReponse.match(/\[[\s\S]*\]/);
    if (!matchJSON) return { inseres: 0 };

    const prospectsTrouves = JSON.parse(matchJSON[0]);

    // Déduplication : on ne réinsère pas une entreprise déjà connue (même site/réseau, ou
    // même nom) — sinon le CRM se remplit de doublons au lieu de vraies nouvelles opportunités,
    // ce qui va exactement à l'encontre de l'objectif (trouver PLUS de personnes DISTINCTES).
    const { data: existants } = await supabaseAdmin.from("prospects").select("nom, site_web");
    const nomsConnus = new Set((existants || []).map((p) => (p.nom || "").trim().toLowerCase()));
    const sitesConnus = new Set((existants || []).map((p) => (p.site_web || "").trim().toLowerCase()).filter(Boolean));

    const nouveaux = prospectsTrouves.filter((p) => {
      const nom = (p.nom || "").trim().toLowerCase();
      const site = (p.site_web_ou_reseau || "").trim().toLowerCase();
      if (nom && nomsConnus.has(nom)) return false;
      if (site && sitesConnus.has(site)) return false;
      return true;
    });

    const lignesAInserer = nouveaux.map((p) => ({
      nom: p.nom || null,
      entreprise: p.nom || null,
      secteur: p.secteur || secteur,
      ville: p.ville || ville,
      pays: "CI",
      source: "cron_auto_horaire",
      site_web: p.site_web_ou_reseau || null,
      telephone: p.telephone_whatsapp || null,
      probleme_identifie: p.probleme_identifie || null,
      score: Number(p.score) || 0,
      message_suggere: p.message_suggere || null,
      statut: "NEW",
    }));
    if (lignesAInserer.length > 0) await supabaseAdmin.from("prospects").insert(lignesAInserer);
    return { inseres: lignesAInserer.length, doublons_ignores: prospectsTrouves.length - nouveaux.length, prospectsChauds: lignesAInserer.filter((p) => p.score >= 70) };
  } catch (e) {
    return { inseres: 0, erreur: e.message };
  }
}

// ===== Boîte de réception IA (§21) — génère de vraies alertes à partir de signaux réels,
// avec anti-doublon (pas d'alerte répétée si une similaire existe déjà depuis moins de 24h).
async function creerAlerteSiNouvelle(titre, description, priority, source_agent) {
  const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: existante } = await supabaseAdmin
    .from("ai_alerts")
    .select("id")
    .eq("title", titre)
    .gte("created_at", hier)
    .maybeSingle();
  if (existante) return false;
  await supabaseAdmin.from("ai_alerts").insert([{ title: titre, description, priority, source_agent }]);
  return true;
}

async function genererAlertesIA(nouveauxProspectsChauds) {
  let creees = 0;

  // Signal 1 : nouveau prospect RecuVente chaud trouvé dans cette exécution.
  for (const p of nouveauxProspectsChauds) {
    const ok = await creerAlerteSiNouvelle(
      `🟢 Nouveau prospect chaud : ${p.nom}`,
      `Score ${p.score}/100, secteur "${p.secteur}", ${p.ville}. Trouvé par l'agent Prospection.`,
      "HIGH",
      "prospecting"
    );
    if (ok) creees++;
  }

  // Signal 2 : prospect stratégique (Business Engine) jamais relancé.
  const { data: strategiques } = await supabaseAdmin
    .from("prospects_business")
    .select("nom, statut")
    .eq("proprietaire_email", "oulipaiexpress@gmail.com")
    .eq("strategic_priority", true)
    .in("statut", ["nouveau", "contacte"]);
  for (const p of strategiques || []) {
    const ok = await creerAlerteSiNouvelle(
      `🔴 Prospect stratégique non relancé : ${p.nom}`,
      `Marqué priorité stratégique, toujours au statut "${p.statut}".`,
      "CRITICAL",
      "sales"
    );
    if (ok) creees++;
  }

  // Signal 3 : clients Azali fidèles sans achat depuis 30j+ (résumé, pas un par client).
  const { data: workspace } = await supabaseAdmin.from("workspaces").select("id").eq("slug", "azaliexpress").maybeSingle();
  if (workspace) {
    const { data: commandes } = await supabaseAdmin.from("commandes").select("client, created_at").eq("workspace_id", workspace.id).eq("statut", "confirmee");
    const parClient = {};
    (commandes || []).forEach((c) => {
      const nom = (c.client || "").trim();
      if (!nom) return;
      if (!parClient[nom]) parClient[nom] = { nb: 0, derniere: c.created_at };
      parClient[nom].nb += 1;
      if (new Date(c.created_at) > new Date(parClient[nom].derniere)) parClient[nom].derniere = c.created_at;
    });
    const trenteJours = Date.now() - 30 * 24 * 3600 * 1000;
    const aRisque = Object.values(parClient).filter((c) => c.nb >= 2 && new Date(c.derniere).getTime() < trenteJours);
    if (aRisque.length > 0) {
      const ok = await creerAlerteSiNouvelle(
        `🟠 ${aRisque.length} client${aRisque.length > 1 ? "s" : ""} fidèle${aRisque.length > 1 ? "s" : ""} Azali sans achat depuis 30j+`,
        "Détail complet disponible dans Customer Success IA.",
        "MEDIUM",
        "customer_success"
      );
      if (ok) creees++;
    }
  }

  return { alertesCreees: creees };
}

// ===== Relance des envois Meta/Facebook en échec (§9 fiabilisation) — une commande dont
// l'envoi immédiat a échoué (coupure réseau côté client, Facebook temporairement indisponible)
// ne doit jamais rester bloquée indéfiniment. On retente ici, sans dépendre du navigateur.
async function retenterEnvoisCAPIEnAttente() {
  const limite = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: commandesEnAttente } = await supabaseAdmin
    .from("commandes")
    .select("id")
    .eq("purchase_event_envoye", false)
    .gte("created_at", limite)
    .limit(50);

  if (!commandesEnAttente || commandesEnAttente.length === 0) return { retentees: 0 };

  const origine = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://recuvente-saas.vercel.app";
  await executerParLots(
    commandesEnAttente.map((c) => async () => {
      await fetch(`${origine}/api/facebook-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-cron-secret": process.env.CRON_SECRET },
        body: JSON.stringify({ commandeId: c.id }),
      }).catch(() => {});
    }),
    3
  );
  return { retentees: commandesEnAttente.length };
}

async function lancerProspectionAutomatique() {
  // En parallèle plutôt qu'en série : les 3 recherches partent en même temps, donc le temps
  // total dépend de la plus lente des trois, pas de leur somme. C'est ce qui permet de rester
  // dans le temps d'exécution autorisé par Vercel (voir aussi son ordre dans handler() plus bas :
  // elle passe désormais en premier, avant sauvegarde/essais/stock, pour ne jamais être coupée
  // si le temps manque).
  // Round-robin (pas aléatoire) sur secteur×ville : maximise la couverture réelle plutôt que
  // de retomber souvent sur les mêmes combinaisons par hasard.
  const combinaisons = await prochainesCombinaisons(3);
  const resultats = await Promise.all(
    combinaisons.map(async ({ secteur, ville }) => {
      const r = await chercherProspectsAvecClaude(secteur, ville);
      return { secteur, ville, ...r };
    })
  );
  return resultats;
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  // Prospection en premier, tant que tout le temps d'exécution est encore disponible —
  // c'est la tâche la plus lente (3 appels IA + recherche web) et celle qu'on ne veut
  // jamais voir coupée en plein milieu par une limite de temps.
  const resultatProspection = await lancerProspectionAutomatique();
  const tousLesProspectsChauds = resultatProspection.flatMap((r) => r.prospectsChauds || []);
  const resultatAlertes = await genererAlertesIA(tousLesProspectsChauds);
  const sauvegardeReussie = await sauvegarderQuotidiennement();
  const resultatEssais = await verifierEssaisEtRappels();
  const resultatStock = await verifierStockBas();
  // Isolé dans son propre try/catch, comme les autres lots plus récents ci-dessous : une
  // erreur ici ne doit jamais empêcher le reste du cron quotidien (stock, essais, paiements...)
  // de s'exécuter.
  let resultatEcartsCaisse = null;
  try { resultatEcartsCaisse = await verifierEcartsCaisse(); } catch (e) { console.error("Erreur écarts caisse:", e); }
  const resultatRetryCAPI = await retenterEnvoisCAPIEnAttente();
  // Filet de sécurité du paiement en ligne : vérifie les paiements restés « en attente » (notification jamais reçue).
  let resultatPaiements = null;
  try { resultatPaiements = await (await import("../lib/paiements.js")).rattraperPaiementsEnAttente(); } catch (_) {}
  // Filet de sécurité du paiement Stripe (marché Europe) : rattrape les clients qui ont payé mais dont le
  // navigateur n'est jamais revenu confirmer côté serveur (pas de webhook dans ce lot — voir lib/stripe.js).
  let resultatStripe = null;
  try { resultatStripe = await (await import("../lib/stripe.js")).rattraperPaiementsStripeEnAttente(); } catch (_) {}
  // LOT 3 (location de maison) : génère les loyers du mois (et du mois suivant à J-5) pour chaque
  // bail actif, puis relance le propriétaire s'il a des loyers en retard. Isolé dans son propre
  // try/catch : une erreur ici ne doit jamais empêcher le reste du cron quotidien de s'exécuter.
  let resultatLoyers = null;
  try { resultatLoyers = await (await import("../lib/loyers.js")).genererLoyersEtRelances(); } catch (_) {}

  // LOT G (abonnement personnel du filleul) : détecte les filleuls qui viennent de franchir
  // leur seuil de commandes nettes, puis suspend ceux dont le délai de grâce est écoulé sans
  // paiement. Deux fonctions SQL distinctes, isolées dans leur propre try/catch chacune — une
  // erreur ici ne doit jamais empêcher le reste du cron quotidien de s'exécuter.
  let resultatSeuilAbonnementFilleul = null;
  try {
    const { data } = await supabaseAdmin.rpc("fn_detecter_seuil_abonnement_filleuls");
    resultatSeuilAbonnementFilleul = data;
  } catch (_) {}
  let resultatGraceAbonnementFilleul = null;
  try {
    const { data } = await supabaseAdmin.rpc("fn_expirer_grace_abonnement_filleuls");
    resultatGraceAbonnementFilleul = data;
  } catch (_) {}

  return res.status(200).json({
    prospection: resultatProspection,
    alertes: resultatAlertes,
    sauvegardeReussie,
    ...resultatEssais,
    ...resultatStock,
    ecartsCaisse: resultatEcartsCaisse,
    retryCAPI: resultatRetryCAPI,
    paiementsEnLigne: resultatPaiements,
    paiementsStripe: resultatStripe,
    loyers: resultatLoyers,
    abonnementFilleulSeuilDetecte: resultatSeuilAbonnementFilleul,
    abonnementFilleulGraceExpiree: resultatGraceAbonnementFilleul,
  });
}
