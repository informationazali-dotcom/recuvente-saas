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
  { id: "coaching", icone: "🎓", label: "Vendre mes formations / coachings", parcours: "bientot" },
  { id: "application", icone: "📱", label: "Créer une application", parcours: "bientot" },
  { id: "saas", icone: "🚀", label: "Créer un SaaS", parcours: "bientot" },
  { id: "digitaliser", icone: "🏢", label: "Digitaliser mon entreprise", parcours: "bientot" },
  { id: "partenaire", icone: "🤝", label: "Trouver un partenaire technique", parcours: "bientot" },
  { id: "projet_strategique", icone: "🏛️", label: "Soumettre un projet stratégique", parcours: "bientot" },
  { id: "ne_sait_pas", icone: "❓", label: "Je ne sais pas encore", parcours: "bientot" },
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
