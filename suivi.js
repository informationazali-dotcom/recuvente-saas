// ============================================================================
// PRODUCT PAGE BUILDER — suivi des événements de page (analytics interne)
// ----------------------------------------------------------------------------
// Enregistre le parcours d'une page produit dans la table `evenements_page_produit`
// via la fonction SQL `enregistrer_evenement_page_produit` (voir la migration).
//
// Événements : vue_page, clic_cta, formulaire_ouvert, formulaire_commence,
//              offre_selectionnee, upsell_accepte, commande_creee.
// "confirmée / livrée / refusée" ne sont PAS envoyés par le navigateur : ils sont lus
// côté serveur en rejoignant `commandes.statut` grâce au commande_id de `commande_creee`.
//
// Ce module ne fait jamais planter la page : toute erreur est silencieuse.
// ============================================================================

const CLE_SESSION = "rv_pp_session";

export const EVENEMENTS_PAGE = [
  "vue_page", "clic_cta", "formulaire_ouvert", "formulaire_commence",
  "offre_selectionnee", "upsell_accepte", "commande_creee",
];

function identifiantSession() {
  try {
    let id = sessionStorage.getItem(CLE_SESSION);
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      sessionStorage.setItem(CLE_SESSION, id);
    }
    return id;
  } catch (_) {
    return null;
  }
}

// Crée un traceur lié à une page ouverte. Les événements "uniques" (vue, formulaire ouvert /
// commencé…) ne sont envoyés qu'une fois par ouverture de page.
export function creerSuiviPage({ supabase, workspaceId, produitId, template, source }) {
  const dejaEnvoyes = new Set();
  const session = identifiantSession();
  const UNIQUES = new Set(["vue_page", "formulaire_ouvert", "formulaire_commence"]);

  return function suivre(evenement, infos = {}) {
    try {
      if (!supabase || !workspaceId || !produitId || !EVENEMENTS_PAGE.includes(evenement)) return;
      if (UNIQUES.has(evenement)) {
        if (dejaEnvoyes.has(evenement)) return;
        dejaEnvoyes.add(evenement);
      }
      const { offre_id = null, commande_id = null, ...meta } = infos;
      supabase
        .rpc("enregistrer_evenement_page_produit", {
          p_workspace_id: workspaceId,
          p_produit_id: produitId,
          p_evenement: evenement,
          p_session_id: session,
          p_template: template || null,
          p_offre_id: offre_id ? String(offre_id) : null,
          p_commande_id: commande_id ? String(commande_id) : null,
          p_source: source || null,
          p_meta: meta,
        })
        .then(() => {}, () => {});
    } catch (_) { /* le suivi ne doit jamais casser la page */ }
  };
}
