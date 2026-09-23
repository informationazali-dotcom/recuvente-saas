// ============================================================================
//  RecuVente — LOT 4 : Location de voitures/véhicules — utilitaires partagés.
//  Utilisé à la fois par App.jsx (formulaire "Nouvelle location" existant) et par
//  LocationVoiture.jsx (calendrier, retours). Aucune dépendance externe.
//
//  Sémantique des dates : IDENTIQUE au calcul déjà utilisé dans App.jsx et
//  CataloguePublic.jsx pour le nombre de jours de location :
//    nbJours = round((fin - debut) / 1 jour) + 1   → date_debut ET date_fin sont
//  TOUTES LES DEUX des jours facturés/occupés (bornes incluses des deux côtés).
//  Deux périodes [d1,f1] et [d2,f2] se chevauchent donc dès qu'elles partagent au
//  moins un jour en commun : d1 <= f2 ET f1 >= d2.
// ============================================================================

// Statuts de "commandes" qui bloquent le véhicule (tout sauf annulée/échouée — même
// filtre que celui déjà utilisé ailleurs dans App.jsx, ex: `c.statut !== "annulee" && c.statut !== "echouee"`).
export function statutBloquant(statut) {
  return statut !== "annulee" && statut !== "echouee";
}

// Convertit une date "YYYY-MM-DD" (ou un objet Date) en Date à minuit local, pour comparer
// des jours-calendrier sans risque de décalage de fuseau horaire (jamais .toISOString() sur
// une date locale : ça peut faire basculer sur le jour précédent/suivant selon le fuseau).
export function versDateLocale(valeur) {
  if (!valeur) return null;
  if (valeur instanceof Date) return new Date(valeur.getFullYear(), valeur.getMonth(), valeur.getDate());
  const [y, m, d] = String(valeur).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Nombre de jours facturés pour une période [debut, fin] bornes incluses — identique au
// calcul du formulaire existant (AddCommandeModal dans App.jsx et CataloguePublic.jsx).
export function joursLocation(dateDebut, dateFin) {
  const d1 = versDateLocale(dateDebut);
  const d2 = versDateLocale(dateFin);
  if (!d1 || !d2) return 0;
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

// Deux périodes bornes incluses se chevauchent-elles ?
export function periodesSeChevauchent(debut1, fin1, debut2, fin2) {
  const d1 = versDateLocale(debut1), f1 = versDateLocale(fin1);
  const d2 = versDateLocale(debut2), f2 = versDateLocale(fin2);
  if (!d1 || !f1 || !d2 || !f2) return false;
  return d1 <= f2 && f1 >= d2;
}

// ----------------------------------------------------------------------------
//  verifierChevauchement — fonction principale demandée par le brief.
//  commandesExistantes : liste de commandes déjà chargées (celles du workspace suffisent),
//    chaque élément doit avoir au minimum { id, bien_location_id, date_debut_location,
//    date_fin_location, statut }.
//  bienId : id du véhicule/bien pour lequel on réserve.
//  dateDebut / dateFin : période demandée ("YYYY-MM-DD").
//  options.excludeCommandeId : ignore cette commande (utile en modification).
//
//  Retourne la commande en conflit (la première trouvée) ou null si la période est libre.
// ----------------------------------------------------------------------------
export function verifierChevauchement(commandesExistantes, bienId, dateDebut, dateFin, options = {}) {
  if (!bienId || !dateDebut || !dateFin) return null;
  const exclureId = options.excludeCommandeId || null;
  const liste = Array.isArray(commandesExistantes) ? commandesExistantes : [];
  for (const c of liste) {
    if (!c || c.id === exclureId) continue;
    if (c.bien_location_id !== bienId) continue;
    if (!statutBloquant(c.statut)) continue;
    if (!c.date_debut_location || !c.date_fin_location) continue;
    if (periodesSeChevauchent(dateDebut, dateFin, c.date_debut_location, c.date_fin_location)) {
      return c;
    }
  }
  return null;
}

// Message d'erreur prêt à afficher, dans le format demandé par le brief.
export function messageChevauchement(commandeConflit) {
  if (!commandeConflit) return "";
  const fmt = (d) => {
    const dt = versDateLocale(d);
    return dt ? dt.toLocaleDateString("fr-FR") : d;
  };
  return `Ce véhicule est déjà loué du ${fmt(commandeConflit.date_debut_location)} au ${fmt(commandeConflit.date_fin_location)} (${commandeConflit.client || "un autre client"}).`;
}

// ----------------------------------------------------------------------------
//  Pénalité de retour en retard = prix/jour × jours de retard × coefficient réglable
//  par l'owner (voir table reglages_location_vehicule, coefficient par défaut 1.5).
// ----------------------------------------------------------------------------
export function joursDeRetard(dateFinLocation, dateReference = new Date()) {
  const fin = versDateLocale(dateFinLocation);
  const auj = versDateLocale(dateReference);
  if (!fin || !auj) return 0;
  const diff = Math.round((auj - fin) / 86400000);
  return diff > 0 ? diff : 0;
}

export function calculerPenaliteRetard(prixJour, joursRetardNb, coefficient = 1.5) {
  const p = Number(prixJour) || 0;
  const j = Number(joursRetardNb) || 0;
  const c = Number(coefficient) || 0;
  if (j <= 0) return 0;
  return Math.round(p * j * c);
}
