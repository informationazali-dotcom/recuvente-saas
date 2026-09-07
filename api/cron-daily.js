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
      source: "agent_ia_auto",
      site_web: p.site_web_ou_reseau || null,
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

  return res.status(200).json({
    prospection: resultatProspection,
    alertes: resultatAlertes,
    sauvegardeReussie,
    ...resultatEssais,
    ...resultatStock,
  });
}
