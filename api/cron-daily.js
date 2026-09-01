import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const sauvegardeReussie = await sauvegarderQuotidiennement();
  const resultatEssais = await verifierEssaisEtRappels();
  const resultatStock = await verifierStockBas();

  return res.status(200).json({
    sauvegardeReussie,
    ...resultatEssais,
    ...resultatStock,
  });
}
