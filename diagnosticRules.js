// Moteur de règles du diagnostic RecuVente Project Intelligence.
// V1 : uniquement des règles simples (if/else), AUCUN appel IA.
// Objectif : rapide, gratuit, sans risque d'invention. Un moteur IA pourra
// remplacer/compléter ce fichier plus tard sans toucher à l'UI (ProjectDiagnostic.jsx).

export const OBJECTIFS_DIAGNOSTIC = [
  { id: "vendre_plus", icone: "🚀", label: "Vendre plus", parcours: "ecommerce" },
  { id: "developper_ecommerce", icone: "🛒", label: "Développer mon e-commerce", parcours: "ecommerce" },
  { id: "trouver_clients", icone: "🎯", label: "Trouver plus de clients", parcours: "bientot" },
  { id: "presence_digitale", icone: "🌐", label: "Construire ma présence digitale", parcours: "bientot" },
  { id: "automatiser", icone: "🤖", label: "Automatiser mon activité", parcours: "bientot" },
  { id: "campagnes_pub", icone: "📈", label: "Améliorer mes campagnes publicitaires", parcours: "bientot" },
  { id: "coaching", icone: "🎓", label: "Vendre mes formations / coachings", parcours: "coach" },
  { id: "application", icone: "📱", label: "Créer une application", parcours: "startup" },
  { id: "saas", icone: "🚀", label: "Créer un SaaS", parcours: "startup" },
  { id: "digitaliser", icone: "🏢", label: "Digitaliser mon entreprise", parcours: "entreprise" },
  { id: "partenaire", icone: "🤝", label: "Trouver un partenaire technique", parcours: "agence" },
  { id: "projet_strategique", icone: "🏛️", label: "Soumettre un projet stratégique", parcours: "strategique" },
  { id: "ne_sait_pas", icone: "❓", label: "Je ne sais pas encore", parcours: "libre" },
];

export const OPTIONS_TRANCHE_CA = [
  "Moins de 250 000 FCFA", "250 000 – 500 000", "500 000 – 1M", "1M – 3M", "3M – 10M", "10M+", "Je préfère ne pas répondre",
];

export const OPTIONS_TYPE_BOUTIQUE = ["Shopify", "WooCommerce", "PrestaShop", "Site personnalisé", "Autre"];

export const OPTIONS_CANAUX = ["Meta Ads", "Google Ads", "TikTok Ads", "Influence", "Organique", "Aucun", "Plusieurs"];

export const OPTIONS_PROBLEME = [
  "Je manque de trafic",
  "J'ai du trafic mais peu de ventes",
  "Mon taux de conversion est faible",
  "Mes publicités sont trop chères",
  "Je reçois des commandes mais beaucoup ne sont pas livrées",
  "Je ne fidélise pas mes clients",
  "Je ne sais pas quoi améliorer",
  "Autre",
];

// --- Parcours Coach / Formateur (§7) ---
export const OPTIONS_TYPE_OFFRE_COACH = ["Coaching", "Formation", "Accompagnement", "Consultation", "Programme", "Abonnement", "Autre"];
export const OPTIONS_CANAL_COACH = ["Facebook", "Instagram", "TikTok", "Google", "WhatsApp", "Référencement", "Recommandation", "Autre"];
export const OPTIONS_PROBLEME_COACH = [
  "Peu de prospects",
  "Beaucoup de prospects mais peu de ventes",
  "Difficulté à prendre des rendez-vous",
  "Mauvaise conversion",
  "Pas d'automatisation",
  "Autre",
];

// --- Parcours Entreprise / PME (§8) ---
export const OPTIONS_A_DEJA_SYSTEME = ["Oui", "Non", "Partiellement"];
export const OPTIONS_AMELIORER_ENTREPRISE = [
  "Présence digitale", "Acquisition", "Processus internes", "CRM", "Vente",
  "Automatisation", "Données", "Application", "Plateforme", "Portail client", "Autre",
];
export const OPTIONS_NIVEAU_PROJET = ["Petit projet", "Projet départemental", "Projet entreprise", "Projet stratégique", "Je ne sais pas"];
export const OPTIONS_BUDGET_ENTREPRISE = ["Moins de 1M FCFA", "1M – 3M", "3M – 5M", "5M – 10M", "10M+", "Je préfère ne pas répondre"];
export const OPTIONS_DEMARRAGE = ["Immédiatement", "Dans le mois", "Dans les 3 mois", "Plus tard / à définir"];

// --- Parcours Startup (§10) ---
export const OPTIONS_TYPE_PRODUIT_STARTUP = ["SaaS", "Application mobile", "Plateforme web", "Marketplace", "Outil métier", "IA", "Autre"];
export const OPTIONS_STADE_STARTUP = ["Idée", "Prototype", "MVP", "Produit existant", "Produit en croissance"];
export const OPTIONS_MODELE_ECONOMIQUE = ["Abonnement", "Freemium", "Vente unique", "Commission / marketplace", "Publicité", "Pas encore défini", "Autre"];

// --- Parcours Agence / Media buyer (§11) ---
export const OPTIONS_SERVICES_AGENCE = ["Développement", "Landing pages", "Funnels", "E-commerce", "Tracking", "Automatisation", "SaaS"];
export const OPTIONS_DELAI_AGENCE = ["Urgent (moins de 2 semaines)", "2 à 4 semaines", "1 à 2 mois", "Flexible"];
export const OPTIONS_MODELE_COLLABORATION = ["Forfait par projet", "Abonnement mensuel", "Commission / revenue share", "À discuter"];

// --- Parcours Projet stratégique (§9) — toujours marqué priorité stratégique au CRM ---
export const OPTIONS_TAILLE_ORG = ["1 à 10 personnes", "11 à 50 personnes", "51 à 200 personnes", "201 à 1000 personnes", "Plus de 1000 personnes"];
export const OPTIONS_OUI_NON = ["Oui", "Non"];

// Points internes par tranche (score de qualification, jamais montré au visiteur)
const POINTS_TRANCHE = {
  "Moins de 250 000 FCFA": 5, "250 000 – 500 000": 10, "500 000 – 1M": 15,
  "1M – 3M": 20, "3M – 10M": 25, "10M+": 30, "Je préfère ne pas répondre": 0,
};

export function calculerScore(reponses) {
  let score = 0;
  score += POINTS_TRANCHE[reponses.caMensuel] || 0;
  score += Math.round((POINTS_TRANCHE[reponses.budgetPub] || 0) * 0.66); // pondéré, poids max ~20
  if (reponses.avezBoutique === "Oui") score += 15;
  else if (reponses.avezBoutique === "Je suis en train de la créer") score += 8;
  if (Array.isArray(reponses.canaux) && reponses.canaux.length > 0 && !reponses.canaux.includes("Aucun")) score += 15;
  if (reponses.commandesMois && Number(String(reponses.commandesMois).replace(/\D/g, "")) > 0) score += 10;
  return Math.min(100, score);
}

// Diagnostic e-commerce basé uniquement sur les réponses données — jamais d'inspection
// réelle de la boutique même si une URL a été fournie. Le texte le rappelle explicitement.
export function diagnostiquerEcommerce(reponses) {
  let levier = "Audit global";
  let recommandations = ["Audit de la boutique", "Funnel de conversion", "Tracking"];
  let defiTexte = "Vous n'êtes pas encore sûr de ce qui freine le plus votre activité.";

  switch (reponses.problemePrincipal) {
    case "Je manque de trafic":
      levier = "Acquisition";
      recommandations = ["Audit de la boutique", "Meta Ads", "Tracking", "Retargeting"];
      defiTexte = "Votre boutique ne reçoit pas assez de visiteurs.";
      break;
    case "J'ai du trafic mais peu de ventes":
    case "Mon taux de conversion est faible":
      levier = "Conversion";
      recommandations = ["Optimisation de la page produit", "Funnel de conversion", "Tracking"];
      defiTexte = "Vos visiteurs arrivent, mais n'achètent pas assez.";
      break;
    case "Mes publicités sont trop chères":
      levier = "Optimisation publicitaire";
      recommandations = ["Tracking", "Retargeting", "Meta Ads"];
      defiTexte = "Votre coût d'acquisition est trop élevé pour être rentable.";
      break;
    case "Je reçois des commandes mais beaucoup ne sont pas livrées":
      levier = "Confirmation & livraison";
      recommandations = ["Automatisation des relances", "Suivi de livraison", "Audit de la boutique"];
      defiTexte = "Une partie de vos commandes se perd entre la validation et la livraison — c'est exactement le problème que RecuVente (l'outil derrière cette page) est conçu pour résoudre.";
      break;
    case "Je ne fidélise pas mes clients":
      levier = "Fidélisation";
      recommandations = ["Automatisation", "CRM"];
      defiTexte = "Vos clients achètent une fois, mais ne reviennent pas.";
      break;
    default:
      break;
  }

  const situationTexte = reponses.avezBoutique === "Non"
    ? "Vous n'avez pas encore de boutique en ligne."
    : reponses.avezBoutique === "Je suis en train de la créer"
    ? "Votre boutique est en cours de création."
    : `Vous avez déjà une boutique${reponses.typeBoutique ? ` (${reponses.typeBoutique})` : ""}, avec un chiffre d'affaires mensuel d'environ ${reponses.caMensuel || "non précisé"}.`;

  const objectifTexte = reponses.objectifRevenu
    ? `Vous souhaitez atteindre environ ${reponses.objectifRevenu} de revenu mensuel.`
    : "Objectif de revenu non précisé.";

  return {
    levierPrincipal: levier,
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScore(reponses),
  };
}

// --- Diagnostic Coach / Formateur (§7) ---
function extraireNombre(texte) {
  const n = Number(String(texte || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function calculerScoreCoach(reponses) {
  let score = 0;
  const prix = extraireNombre(reponses.prixMoyen);
  if (prix >= 100000) score += 25;
  else if (prix >= 50000) score += 15;
  else if (prix > 0) score += 5;
  if (reponses.avezTunnel === "Oui") score += 20;
  if (extraireNombre(reponses.prospectsMois) > 0) score += 20;
  if (extraireNombre(reponses.ventesMois) > 0) score += 15;
  return Math.min(100, score);
}

export function diagnostiquerCoach(reponses) {
  let levier = "Audit global";
  let recommandations = ["Audit du tunnel actuel", "Landing page", "Qualification"];
  let defiTexte = "Vous n'êtes pas encore sûr de ce qui freine le plus vos ventes.";

  switch (reponses.problemeCoach) {
    case "Peu de prospects":
      levier = "Acquisition";
      recommandations = ["Lead magnet / diagnostic", "Landing page", "Publicité ciblée"];
      defiTexte = "Vous ne générez pas assez de prospects.";
      break;
    case "Beaucoup de prospects mais peu de ventes":
      levier = "Qualification & conversion";
      recommandations = ["Qualification automatisée", "Suivi WhatsApp", "Script de vente"];
      defiTexte = "Vos prospects n'avancent pas assez vers l'achat.";
      break;
    case "Difficulté à prendre des rendez-vous":
      levier = "Prise de rendez-vous";
      recommandations = ["Système de réservation", "Relances automatiques", "WhatsApp"];
      defiTexte = "Vous avez du mal à transformer l'intérêt en rendez-vous.";
      break;
    case "Mauvaise conversion":
      levier = "Conversion";
      recommandations = ["Tunnel de vente", "Offre clarifiée", "Suivi post-appel"];
      defiTexte = "Vos rendez-vous ne se transforment pas assez en ventes.";
      break;
    case "Pas d'automatisation":
      levier = "Automatisation";
      recommandations = ["CRM", "WhatsApp automatisé", "Workflows"];
      defiTexte = "Le suivi de vos prospects se fait encore manuellement.";
      break;
    default:
      break;
  }

  const situationTexte = `Vous vendez principalement du ${reponses.typeOffre || "non précisé"}${reponses.prixMoyen ? `, à un prix moyen d'environ ${reponses.prixMoyen}` : ""}, avec ${reponses.canalAcquisition || "un canal non précisé"} comme principal canal d'acquisition.`;
  const objectifTexte = reponses.ventesMois
    ? `Vous réalisez environ ${reponses.ventesMois} vente(s) par mois actuellement.`
    : "Volume de ventes actuel non précisé.";

  return {
    levierPrincipal: levier,
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScoreCoach(reponses),
  };
}

// --- Diagnostic Entreprise / PME (§8) ---
// Priorité de sélection du levier quand plusieurs axes d'amélioration sont cochés.
const PRIORITE_LEVIER_ENTREPRISE = ["Acquisition", "Vente", "CRM", "Processus internes", "Automatisation", "Données", "Présence digitale", "Application", "Plateforme", "Portail client", "Autre"];

const RECOMMANDATIONS_PAR_AXE = {
  "Présence digitale": ["Site institutionnel", "Refonte de présence en ligne"],
  "Acquisition": ["Stratégie d'acquisition", "Campagnes ciblées", "Tracking"],
  "Processus internes": ["Audit des processus", "Automatisation", "Outils internes"],
  "CRM": ["CRM sur mesure", "Automatisation du suivi client"],
  "Vente": ["Système de vente", "Pipeline commercial"],
  "Automatisation": ["Automatisation", "Workflows", "Intégrations"],
  "Données": ["Dashboard", "Reporting", "Centralisation des données"],
  "Application": ["Application sur mesure", "Architecture technique"],
  "Plateforme": ["Plateforme web", "Architecture technique"],
  "Portail client": ["Portail client", "Espace utilisateur sécurisé"],
  "Autre": ["Audit global"],
};

// Points calibrés pour que budget max + projet stratégique + démarrage immédiat = 100,
// ce qui déclenche le seuil "strategic_priority" (>=81) déjà utilisé côté SQL (§29).
const POINTS_BUDGET_ENTREPRISE = { "Moins de 1M FCFA": 5, "1M – 3M": 15, "3M – 5M": 25, "5M – 10M": 35, "10M+": 45, "Je préfère ne pas répondre": 0 };
const POINTS_NIVEAU_PROJET = { "Petit projet": 5, "Projet départemental": 15, "Projet entreprise": 25, "Projet stratégique": 35, "Je ne sais pas": 0 };
const POINTS_DEMARRAGE = { "Immédiatement": 20, "Dans le mois": 15, "Dans les 3 mois": 8, "Plus tard / à définir": 0 };

export function calculerScoreEntreprise(reponses) {
  const score = (POINTS_BUDGET_ENTREPRISE[reponses.budgetEntreprise] || 0)
    + (POINTS_NIVEAU_PROJET[reponses.niveauProjet] || 0)
    + (POINTS_DEMARRAGE[reponses.demarrage] || 0);
  return Math.min(100, score);
}

export function diagnostiquerEntreprise(reponses) {
  const axes = reponses.ameliorer || [];
  const axePrincipal = PRIORITE_LEVIER_ENTREPRISE.find((a) => axes.includes(a)) || "Autre";
  const recommandations = RECOMMANDATIONS_PAR_AXE[axePrincipal] || RECOMMANDATIONS_PAR_AXE["Autre"];

  const situationTexte = `Votre organisation ${reponses.hasSysteme === "Oui" ? "dispose déjà d'un système en place" : reponses.hasSysteme === "Partiellement" ? "dispose d'un système partiel" : "ne dispose pas encore d'un système dédié"}${reponses.personnesConcernees ? `, pour environ ${reponses.personnesConcernees} personne(s) concernée(s)` : ""}.`;
  const objectifTexte = axes.length > 0 ? `Vous souhaitez avant tout améliorer : ${axes.join(", ")}.` : "Axes d'amélioration non précisés.";
  const defiTexte = `Le projet se situe au niveau "${reponses.niveauProjet || "non précisé"}", avec un démarrage souhaité ${reponses.demarrage ? reponses.demarrage.toLowerCase() : "non précisé"}.`;

  return {
    levierPrincipal: axePrincipal,
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScoreEntreprise(reponses),
  };
}

// --- Diagnostic Startup (§10) ---
const TRAJECTOIRE_STARTUP = ["Idée", "Architecture", "Prototype", "MVP", "Tests", "Lancement", "Acquisition"];
const INDEX_STADE_STARTUP = { "Idée": 0, "Prototype": 2, "MVP": 3, "Produit existant": 5, "Produit en croissance": 6 };
const POINTS_STADE_STARTUP = { "Idée": 5, "Prototype": 10, "MVP": 15, "Produit existant": 20, "Produit en croissance": 25 };

export function calculerScoreStartup(reponses) {
  const score = (POINTS_BUDGET_ENTREPRISE[reponses.budgetStartup] || 0)
    + (POINTS_DEMARRAGE[reponses.lancementStartup] || 0)
    + (POINTS_STADE_STARTUP[reponses.stadeStartup] || 0)
    + (reponses.equipeTechnique === "Oui" ? 10 : 0);
  return Math.min(100, score);
}

export function diagnostiquerStartup(reponses) {
  const index = INDEX_STADE_STARTUP[reponses.stadeStartup];
  const prochainesEtapes = index !== undefined ? TRAJECTOIRE_STARTUP.slice(index + 1) : [];
  const recommandations = prochainesEtapes.length > 0
    ? prochainesEtapes
    : ["Optimisation de l'acquisition", "Automatisation", "Structuration de la croissance"];

  const situationTexte = `Vous construisez ${reponses.typeProduitStartup ? `un(e) ${reponses.typeProduitStartup}` : "un produit non précisé"}, actuellement au stade "${reponses.stadeStartup || "non précisé"}"${reponses.equipeTechnique ? `, ${reponses.equipeTechnique === "Oui" ? "avec" : "sans"} équipe technique en place` : ""}.`;
  const objectifTexte = reponses.utilisateursCibles
    ? `Vous ciblez environ ${reponses.utilisateursCibles} utilisateurs.`
    : "Nombre d'utilisateurs ciblés non précisé.";
  const defiTexte = reponses.modeleEconomique
    ? `Votre modèle économique envisagé est : ${reponses.modeleEconomique}.`
    : "Modèle économique pas encore défini.";

  return {
    levierPrincipal: prochainesEtapes.length > 0 ? `Prochaine étape : ${prochainesEtapes[0]}` : "Croissance & optimisation",
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScoreStartup(reponses),
  };
}

// --- Diagnostic Agence / Media buyer (§11) — débouche sur un partenariat, pas un audit ---
export function calculerScoreAgence(reponses) {
  const clients = extraireNombre(reponses.nombreClients);
  const volume = extraireNombre(reponses.volumeMensuel);
  let score = 0;
  if (clients >= 20) score += 25;
  else if (clients >= 10) score += 18;
  else if (clients >= 5) score += 10;
  else if (clients > 0) score += 5;
  if (volume >= 10) score += 25;
  else if (volume >= 5) score += 15;
  else if (volume >= 1) score += 8;
  if (reponses.whiteLabel === "Oui") score += 15;
  if (["Abonnement mensuel", "Commission / revenue share"].includes(reponses.modeleCollaboration)) score += 20;
  else if (reponses.modeleCollaboration === "Forfait par projet") score += 10;
  if (reponses.delaiAgence === "Urgent (moins de 2 semaines)") score += 15;
  return Math.min(100, score);
}

export function diagnostiquerAgence(reponses) {
  const services = reponses.servicesAgence || [];
  const recommandations = services.length > 0 ? services : ["À définir ensemble selon vos besoins"];

  const situationTexte = `Vous gérez environ ${reponses.nombreClients || "un nombre non précisé de"} client(s)${reponses.typeClients ? `, principalement ${reponses.typeClients}` : ""}, pour un volume mensuel estimé à ${reponses.volumeMensuel || "non précisé"}.`;
  const objectifTexte = `Vous recherchez un partenaire pour : ${services.length > 0 ? services.join(", ") : "des besoins à préciser"}${reponses.whiteLabel === "Oui" ? ", en marque blanche" : ""}.`;
  const defiTexte = `Délai souhaité : ${reponses.delaiAgence || "non précisé"}, modèle de collaboration envisagé : ${reponses.modeleCollaboration || "non précisé"}.`;

  return {
    levierPrincipal: "Partenariat de production",
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScoreAgence(reponses),
  };
}

// --- Diagnostic Projet stratégique (§9) ---
const POINTS_TAILLE_ORG = { "1 à 10 personnes": 5, "11 à 50 personnes": 12, "51 à 200 personnes": 20, "201 à 1000 personnes": 30, "Plus de 1000 personnes": 40 };

export function calculerScoreStrategique(reponses) {
  const score = (POINTS_BUDGET_ENTREPRISE[reponses.budgetStrategique] || 0)
    + (POINTS_DEMARRAGE[reponses.delaiStrategique] || 0)
    + (POINTS_TAILLE_ORG[reponses.tailleOrganisation] || 0)
    + (reponses.accompagnementStrategique === "Oui" ? 10 : 0);
  return Math.min(100, score);
}

export function diagnostiquerStrategique(reponses) {
  const recommandations = reponses.cahierDesCharges === "Oui"
    ? ["Analyse du cahier des charges", "Cadrage technique", "Proposition détaillée"]
    : ["Atelier de cadrage", "Rédaction du cahier des charges", "Proposition détaillée"];

  const situationTexte = `Organisation du secteur ${reponses.secteur || "non précisé"}${reponses.tailleOrganisation ? ` (${reponses.tailleOrganisation})` : ""}, contact en tant que ${reponses.fonction || "fonction non précisée"}.`;
  const objectifTexte = reponses.objectifStrategique || "Objectif du projet non précisé.";
  const defiTexte = reponses.problemeStrategique || "Problème à résoudre non précisé.";

  return {
    levierPrincipal: "Accompagnement stratégique",
    situationTexte,
    objectifTexte,
    defiTexte,
    recommandations,
    score: calculerScoreStrategique(reponses),
  };
}

// --- Parcours "Je ne sais pas encore" (§12) — analyse par mots-clés, PAS une IA.
// Honnête sur ses limites : si rien ne correspond, on dit "Information non déterminée"
// plutôt que d'inventer une catégorie. Sera remplacé par un vrai moteur IA plus tard
// si la Phase IA est validée, sans changer l'UI (ProjectDiagnostic.jsx).
const INFO_NON_DETERMINEE = "Information non déterminée.";

const MOTS_CLES_SECTEUR = [
  { motsCles: ["boutique", "vente", "produit", "client", "commande", "livraison", "e-commerce", "ecommerce"], secteur: "E-commerce" },
  { motsCles: ["coaching", "formation", "accompagnement", "élève", "eleve", "programme", "cours"], secteur: "Coaching / Formation" },
  { motsCles: ["équipe", "equipe", "société", "societe", "entreprise", "organisation", "salarié", "salarie"], secteur: "Entreprise" },
  { motsCles: ["application", "saas", "plateforme", "développeur", "developpeur", "produit tech"], secteur: "Startup / Tech" },
];

const MOTS_CLES_PROBLEME = [
  { motsCles: ["trafic", "visibilité", "visibilite", "personne ne", "connu", "connaît", "connait"], probleme: "Acquisition / visibilité", recommandations: ["Audit de visibilité", "Stratégie d'acquisition"] },
  { motsCles: ["vend pas", "vends pas", "conversion", "achète pas", "achete pas", "panier"], probleme: "Conversion", recommandations: ["Optimisation du parcours d'achat", "Audit de conversion"] },
  { motsCles: ["temps", "organisation", "déborde", "deborde", "seul", "toute seule", "tout seul"], probleme: "Organisation interne", recommandations: ["Automatisation", "Outils de gestion"] },
  { motsCles: ["argent", "budget", "financement", "trésorerie", "tresorerie", "cher"], probleme: "Financement / budget", recommandations: ["Plan d'action à budget maîtrisé"] },
];

export function analyserTexteLibre(texte) {
  const t = (texte || "").toLowerCase();
  const secteurTrouve = MOTS_CLES_SECTEUR.find((s) => s.motsCles.some((m) => t.includes(m)));
  const problemeTrouve = MOTS_CLES_PROBLEME.find((p) => p.motsCles.some((m) => t.includes(m)));
  return {
    secteur: secteurTrouve ? secteurTrouve.secteur : INFO_NON_DETERMINEE,
    probleme: problemeTrouve ? problemeTrouve.probleme : INFO_NON_DETERMINEE,
    recommandations: problemeTrouve ? problemeTrouve.recommandations : ["Échange avec un expert pour clarifier la situation"],
  };
}

export function diagnostiquerLibre(reponses) {
  const texte = reponses.blocagePrincipal || "";
  const analyse = analyserTexteLibre(texte);

  return {
    levierPrincipal: analyse.probleme,
    situationTexte: `Secteur d'activité : ${analyse.secteur} (déduit des mots utilisés — à confirmer avec vous).`,
    objectifTexte: INFO_NON_DETERMINEE,
    defiTexte: analyse.probleme,
    recommandations: analyse.recommandations,
    score: texte.length > 200 ? 40 : texte.length > 50 ? 25 : 10,
  };
}
