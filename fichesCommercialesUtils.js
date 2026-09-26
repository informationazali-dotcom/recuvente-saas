// ============================================================================
//  Petits utilitaires partagés par le moteur de "fiches commerciales" (LOT 7) :
//  construction du lien public, du QR code, du message WhatsApp de partage, et
//  appel des fonctions RPC publiques. Fichier volontairement minimal (pas de
//  composant visuel ici) — importé par LocationMaison.jsx, LocationVoiture.jsx,
//  FichePublique.jsx et ProspectsFiches.jsx, comme locationVehiculeUtils.js
//  l'est déjà par LocationVoiture.jsx.
// ============================================================================

// Types d'entité gérés par le moteur générique de fiches (voir sql/lot7-fiches-commerciales.sql
// et sql/lot8-fiches-location.sql, qui a ajouté 'vehicule_location').
export const TYPES_ENTITE_FICHE = {
  bien_vente: { label: "Bien immobilier à vendre" },
  vehicule_vente: { label: "Véhicule à vendre" },
  logement: { label: "Logement à louer" },
  vehicule_location: { label: "Véhicule/matériel à louer" },
};

// Construit le lien public d'une fiche (query param, comme les autres pages publiques de l'appli).
export function urlFichePublique(typeEntite, entiteId) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/?fiche=${entiteId}&type=${typeEntite}`;
}

// QR code — même service que celui déjà utilisé pour le QR du menu restaurant (RestaurantQR.jsx) :
// un simple <img>, pas de nouvelle dépendance npm, rien de sensible dans l'URL.
export function urlQrFiche(lien, taille = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${taille}x${taille}&data=${encodeURIComponent(lien)}`;
}

// Message de partage WhatsApp — même format que celui déjà utilisé partout ailleurs dans l'appli
// (CataloguePublic.jsx, MenuPublic.jsx...) : https://wa.me/?text=... (sans numéro = partage générique).
export function messageWhatsAppPartageFiche(titre, prix, devise, lien) {
  const texte = `Bonjour, je vous partage cette annonce.\n${titre}\n${Number(prix || 0).toLocaleString("fr-FR")} ${devise}\nVoir les détails : ${lien}`;
  return `https://wa.me/?text=${encodeURIComponent(texte)}`;
}

// Identifiant de session anonyme (pour dédupliquer les vues), comme suivi.js le fait déjà pour
// evenements_page_produit — stocké en sessionStorage, jamais envoyé nulle part d'autre.
export function idSessionFiche() {
  try {
    const cle = "rv_fiche_session";
    let v = sessionStorage.getItem(cle);
    if (!v) { v = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(); sessionStorage.setItem(cle, v); }
    return v;
  } catch (_) { return String(Date.now()); }
}

// Appelle la RPC publique d'enregistrement d'événement (vue, clic, partage) — jamais bloquant :
// une erreur réseau ne doit jamais empêcher l'affichage de la fiche.
export async function enregistrerEvenementFiche(supabase, { workspaceId, typeEntite, entiteId, evenement, source, meta }) {
  try {
    await supabase.rpc("enregistrer_evenement_fiche_public", {
      p_workspace_id: workspaceId, p_type_entite: typeEntite, p_entite_id: entiteId,
      p_evenement: evenement, p_session_id: idSessionFiche(), p_source: source || null, p_meta: meta || {},
    });
  } catch (_) { /* le suivi ne doit jamais bloquer l'affichage */ }
}

// Libellés du pipeline commercial (section 11 du cahier des charges).
export const ETAPES_PIPELINE = [
  ["nouveau", "Nouveau prospect"], ["contacte", "Contacté"], ["interesse", "Intéressé"],
  ["visite_programmee", "Visite programmée"], ["visite_effectuee", "Visite effectuée"],
  ["negociation", "Négociation"], ["reservation", "Réservation"], ["vente_conclue", "Vente conclue"],
  ["perdu", "Perdu"],
];
export const COULEUR_ETAPE_PIPELINE = {
  nouveau: "#6B7168", contacte: "#2452E8", interesse: "#e8920a", visite_programmee: "#e8920a",
  visite_effectuee: "#1a7a3c", negociation: "#8A6412", reservation: "#1F9D6E", vente_conclue: "#16231F",
  perdu: "#B23A26",
};

export const STATUTS_RDV_FICHE = {
  demande: { label: "Demandé", couleur: "#e8920a" },
  confirme: { label: "Confirmé", couleur: "#1a7a3c" },
  reprogramme: { label: "Reprogrammé", couleur: "#2452E8" },
  effectue: { label: "Effectué", couleur: "#1F9D6E" },
  annule: { label: "Annulé", couleur: "#B23A26" },
  absent: { label: "Absent", couleur: "#B23A26" },
};

export function cleanPhoneForWhatsAppFiche(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  if (String(tel || "").trim().startsWith("+") && digits.length >= 9) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}
