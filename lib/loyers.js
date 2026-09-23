// ============================================================================
//  LOT 3 — Location de maison / immobilier : génération quotidienne des loyers
//  et relance du propriétaire pour les loyers en retard.
//
//  Appelé chaque jour par api/cron-daily.js (voir les 3 lignes d'intégration
//  données dans lot3-LISEZMOI.md) ET côté client à l'ouverture du module
//  LocationMaison.jsx (au cas où le cron aurait manqué un jour).
//
//  Idempotent : la contrainte unique (bail_id, periode) sur la table "loyers"
//  empêche tout doublon, même si cette fonction tourne plusieurs fois le
//  même jour ou sur plusieurs instances en parallèle.
// ============================================================================
import { supabaseAdmin } from "./options.js";

function premierDuMois(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function ajouterMois(date, n) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
}
function iso(date) {
  return date.toISOString().slice(0, 10);
}
// Échéance du mois pour un bail : jour_echeance, mais jamais au-delà du dernier jour réel du mois
// (couvre les mois à 28/29/30/31 jours — un jour_echeance de 28 est toujours valide car <= 28 imposé en base).
function dateEcheance(periode, jourEcheance) {
  const dernierJour = new Date(Date.UTC(periode.getUTCFullYear(), periode.getUTCMonth() + 1, 0)).getUTCDate();
  const jour = Math.min(Number(jourEcheance) || 5, dernierJour);
  return new Date(Date.UTC(periode.getUTCFullYear(), periode.getUTCMonth(), jour));
}

// Crée, pour un bail actif donné, la ligne "loyers" d'une période si elle n'existe pas encore,
// et seulement si la période est bien couverte par le bail (pas avant date_debut, pas après date_fin).
async function genererLoyerPeriode(bail, periode) {
  const periodeDate = premierDuMois(periode);
  const debutBail = premierDuMois(new Date(bail.date_debut + "T00:00:00Z"));
  if (periodeDate < debutBail) return null;
  if (bail.date_fin) {
    const finBail = new Date(bail.date_fin + "T00:00:00Z");
    if (periodeDate > finBail) return null;
  }
  const echeance = dateEcheance(periodeDate, bail.jour_echeance);
  const { data, error } = await supabaseAdmin
    .from("loyers")
    .insert([{
      workspace_id: bail.workspace_id,
      bail_id: bail.id,
      periode: iso(periodeDate),
      montant_du: bail.loyer_mensuel,
      date_echeance: iso(echeance),
    }])
    .select("id")
    .maybeSingle();
  // Un code d'erreur 23505 = violation de la contrainte unique (bail_id, periode) : la ligne
  // existe déjà, ce n'est pas une vraie erreur — c'est exactement ce que l'idempotence attend.
  if (error && error.code !== "23505") throw error;
  return data ? data.id : null;
}

// Fonction principale, appelée par le cron quotidien et par le client à l'ouverture du module.
// Pour chaque bail actif : génère la ligne du mois courant, et celle du mois suivant si on est
// à 5 jours ou moins de l'échéance du mois courant (pour laisser le temps de relancer à l'avance).
export async function genererLoyersEtRelances() {
  const aujourdhui = new Date();
  const moisActuel = premierDuMois(aujourdhui);
  const moisSuivant = ajouterMois(moisActuel, 1);

  const { data: bauxActifs, error: errBaux } = await supabaseAdmin
    .from("baux")
    .select("id, workspace_id, logement_id, loyer_mensuel, jour_echeance, date_debut, date_fin, locataire_nom")
    .eq("statut", "actif");
  if (errBaux) return { erreur: errBaux.message, generes: 0, relances: 0 };

  let generes = 0;
  for (const bail of bauxActifs || []) {
    const idCourant = await genererLoyerPeriode(bail, moisActuel);
    if (idCourant) generes++;

    // Génère aussi le mois suivant si on est à J-5 (ou moins) de l'échéance du mois courant,
    // pour que la relance ait le temps d'être vue avant que le prochain loyer soit dû.
    const echeanceCourante = dateEcheance(moisActuel, bail.jour_echeance);
    const joursAvantEcheance = Math.floor((echeanceCourante.getTime() - Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate())) / (24 * 3600 * 1000));
    if (joursAvantEcheance <= 5) {
      const idSuivant = await genererLoyerPeriode(bail, moisSuivant);
      if (idSuivant) generes++;
    }
  }

  // Relance : une notification push récapitulative par boutique, au plus une fois par jour,
  // jamais si zéro loyer en retard.
  const relances = await pousserRappelsLoyersEnRetard();

  return { generes, bauxActifs: (bauxActifs || []).length, ...relances };
}

// Regroupe les loyers en retard par boutique et pousse UNE notification récapitulative par
// boutique ("X loyers en retard"), au plus une fois par jour (anti-doublon via workspace_options).
async function pousserRappelsLoyersEnRetard() {
  const aujourdhuiISO = new Date().toISOString().slice(0, 10);

  const { data: loyersEnRetard, error } = await supabaseAdmin
    .from("loyers")
    .select("id, workspace_id, montant_du, montant_paye, date_echeance")
    .lt("date_echeance", aujourdhuiISO);
  if (error) return { relances: 0, erreurRelances: error.message };

  const parWorkspace = {};
  for (const l of loyersEnRetard || []) {
    const reste = Number(l.montant_du) - Number(l.montant_paye || 0);
    if (reste <= 0) continue; // déjà soldé : pas en retard
    if (!parWorkspace[l.workspace_id]) parWorkspace[l.workspace_id] = { nb: 0, total: 0 };
    parWorkspace[l.workspace_id].nb += 1;
    parWorkspace[l.workspace_id].total += reste;
  }

  const workspaceIds = Object.keys(parWorkspace);
  if (workspaceIds.length === 0) return { relances: 0 };

  let relances = 0;
  let pousserRappelLoyers;
  try {
    ({ pousserRappelLoyers } = await import("../api/notifications.js"));
  } catch (_) {
    // Si l'export n'existe pas encore côté notifications.js, on n'échoue pas tout le cron pour autant.
    return { relances: 0, erreurRelances: "pousserRappelLoyers indisponible" };
  }
  if (typeof pousserRappelLoyers !== "function") return { relances: 0, erreurRelances: "pousserRappelLoyers indisponible" };

  for (const workspaceId of workspaceIds) {
    const cle = `loyers_relance_${aujourdhuiISO}`;
    const { data: dejaEnvoyee } = await supabaseAdmin
      .from("workspace_options")
      .select("valeur")
      .eq("workspace_id", workspaceId)
      .eq("cle", cle)
      .maybeSingle();
    if (dejaEnvoyee) continue; // déjà relancé aujourd'hui pour cette boutique

    const { nb, total } = parWorkspace[workspaceId];
    try {
      await pousserRappelLoyers({ workspaceId, nbEnRetard: nb, totalEnRetard: total });
      await supabaseAdmin.from("workspace_options").upsert(
        [{ workspace_id: workspaceId, cle, valeur: { envoye_le: new Date().toISOString(), nb, total }, updated_at: new Date().toISOString() }],
        { onConflict: "workspace_id,cle" }
      );
      relances++;
    } catch (_) {
      // Une boutique en échec ne doit pas bloquer les autres.
    }
  }

  return { relances };
}
