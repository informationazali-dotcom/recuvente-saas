import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import {
  verifierChevauchement, messageChevauchement, joursLocation, joursDeRetard,
  calculerPenaliteRetard, versDateLocale, statutBloquant,
} from "./locationVehiculeUtils.js";
import { urlFichePublique, urlQrFiche, messageWhatsAppPartageFiche } from "./fichesCommercialesUtils.js";

// ============================================================================
//  LOT 4 — Location de voitures / véhicules : calendrier de disponibilité, retours
//  en retard (avec pénalité), contrat de location PDF, états des lieux départ/retour,
//  entretien & rentabilité par véhicule, réservations & acompte + partage de la page
//  de réservation publique.
//  Tables ajoutées : locations_infos, etats_lieux, entretiens_vehicule,
//  reglages_location_vehicule (voir sql/lot4-location-vehicule.sql).
//  Rendu plein écran, chargé en lazy depuis App.jsx (state showLocationVoiture).
//  N'importe RIEN d'App.jsx (fichier autonome) : petites fonctions dupliquées
//  volontairement (comme RevealOnScroll l'est déjà entre App.jsx et CataloguePublic.jsx).
// ============================================================================

const COULEURS = {
  vert: "#1a7a3c", vertFonce: "#16231F", fond: "#FAFAF7", carte: "#FFFFFF",
  bordure: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", rougeFonce: "#B23A26",
  gris: "#6B7168", grisClair: "#8A9089", bleu: "#2452E8",
};

function devise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : (code || "F CFA");
}
function nb(x) {
  return Number(x || 0).toLocaleString("fr-FR");
}
function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  if (String(tel || "").trim().startsWith("+") && digits.length >= 9) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}
function ajourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function versISOLocal(annee, moisIndex0, jour) {
  return `${annee}-${String(moisIndex0 + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}
function dernierJourDuMois(annee, moisIndex0) {
  return new Date(annee, moisIndex0 + 1, 0).getDate();
}
function fmtDate(d) {
  const dt = versDateLocale(d);
  return dt ? dt.toLocaleDateString("fr-FR") : "—";
}
// Découpe un texte en lignes d'au plus maxCaracteres, en coupant sur les espaces (jamais au
// milieu d'un mot). Volontairement simple (pas de dépendance à jsPDF.splitTextToSize).
function decouperTexte(texte, maxCaracteres) {
  const mots = String(texte || "").split(" ");
  const lignes = [];
  let ligne = "";
  for (const mot of mots) {
    const essai = ligne ? ligne + " " + mot : mot;
    if (essai.length > maxCaracteres && ligne) { lignes.push(ligne); ligne = mot; }
    else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

// Compression d'image légère (même principe que compresserImage() dans App.jsx, dupliquée
// ici : ce module est autonome et n'importe pas App.jsx).
function compresserImageLV(file, maxWidth = 1280, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

const S = {
  section: { padding: "16px 16px 90px" },
  carte: { background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 14, padding: 16, marginBottom: 14 },
  titre: { fontWeight: 700, fontSize: 15, marginBottom: 8 },
  champ: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13.5, boxSizing: "border-box", background: "white", marginBottom: 8 },
  bouton: { background: COULEURS.vert, color: "white", border: "none", borderRadius: 9, padding: "11px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: COULEURS.vertFonce, border: "1px solid #DDD8CC", borderRadius: 9, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  onglet: (actif) => ({ flex: "0 0 auto", textAlign: "center", padding: "10px 12px", fontSize: 12, fontWeight: 700, borderRadius: 9, cursor: "pointer", background: actif ? COULEURS.vert : "transparent", color: actif ? "white" : COULEURS.gris, whiteSpace: "nowrap" }),
};

function peutGerer(role) {
  return role === "owner" || role === "admin";
}

// ============================================================================
//  Chargement des données du module pour l'espace courant.
// ============================================================================
function useDonneesLocationVehicule(workspace) {
  const [biens, setBiens] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [locationsInfos, setLocationsInfos] = useState([]);
  const [etatsLieux, setEtatsLieux] = useState([]);
  const [entretiens, setEntretiens] = useState([]);
  const [reglages, setReglages] = useState({ coefficient_penalite_retard: 1.5 });
  const [vehiculesVente, setVehiculesVente] = useState([]);
  const [charge, setCharge] = useState(false);

  const recharger = useCallback(async () => {
    if (!workspace?.id) return;
    const [b, c, li, el, ev, rg] = await Promise.all([
      supabase.from("biens_location").select("*").eq("workspace_id", workspace.id).order("nom"),
      supabase.from("commandes").select("*").eq("workspace_id", workspace.id).not("bien_location_id", "is", null).order("date_debut_location", { ascending: true }),
      supabase.from("locations_infos").select("*").eq("workspace_id", workspace.id),
      supabase.from("etats_lieux").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: true }),
      supabase.from("entretiens_vehicule").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("reglages_location_vehicule").select("*").eq("workspace_id", workspace.id).maybeSingle(),
    ]);
    setBiens(b.data || []);
    setCommandes(c.data || []);
    setLocationsInfos(li.data || []);
    setEtatsLieux(el.data || []);
    setEntretiens(ev.data || []);
    // .maybeSingle() : selon le client, la donnée peut revenir en objet unique ou (cas de certains
    // faux clients de test) encore sous forme de tableau à un élément — on gère les deux.
    const reglagesLigne = Array.isArray(rg.data) ? rg.data[0] : rg.data;
    setReglages(reglagesLigne || { coefficient_penalite_retard: 1.5 });
    // vehicules_vente (LOT 6) : table séparée, à part — si la migration n'a pas encore été exécutée
    // sur ce compte, on n'affiche pas d'erreur, l'onglet Ventes reste simplement vide.
    try {
      const { data: vv, error: vvErr } = await supabase.from("vehicules_vente").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
      setVehiculesVente(vvErr ? [] : (vv || []));
    } catch (_) { setVehiculesVente([]); }
    setCharge(true);
  }, [workspace?.id]);

  useEffect(() => { recharger(); }, [recharger]);

  return { biens, commandes, locationsInfos, etatsLieux, entretiens, reglages, vehiculesVente, charge, recharger, setReglages };
}

// ============================================================================
//  Composant principal.
// ============================================================================
export default function LocationVoiture({ workspace, session, onClose }) {
  const [onglet, setOnglet] = useState("calendrier");
  const donnees = useDonneesLocationVehicule(workspace);
  const monNom = (session?.user?.email || "").split("@")[0] || "Équipe";
  const gestionnaire = peutGerer(workspace?.role);

  const ONGLETS = [
    { cle: "calendrier", label: "📅 Calendrier" },
    { cle: "retours", label: "↩️ Retours" },
    { cle: "contrat", label: "📄 Contrat" },
    { cle: "etats_lieux", label: "🔎 États des lieux" },
    { cle: "entretien", label: "🔧 Entretien" },
    { cle: "reservations", label: "💰 Réservations" },
    { cle: "ventes", label: "🏷️ Ventes" },
  ];

  // Alertes d'entretien (bandeau + badge) — visibles depuis n'importe quel onglet.
  const alertesEntretien = useMemo(() => calculerAlertesEntretien(donnees.entretiens, donnees.biens), [donnees.entretiens, donnees.biens]);
  // Retours en retard (pour le badge sur l'onglet "Retours").
  const nbRetards = useMemo(() => {
    const auj = ajourdhuiISO();
    return donnees.commandes.filter((c) => statutBloquant(c.statut) && c.statut !== "retournee" && c.date_fin_location && c.date_fin_location < auj).length;
  }, [donnees.commandes]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: COULEURS.fond, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: COULEURS.vertFonce, color: "white", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>🚗 Véhicules — Location & Vente</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, WebkitOverflowScrolling: "touch" }}>
          {ONGLETS.map((o) => (
            <div key={o.cle} onClick={() => setOnglet(o.cle)} style={S.onglet(onglet === o.cle)}>
              {o.label}
              {o.cle === "retours" && nbRetards > 0 && (
                <span style={{ marginLeft: 5, background: onglet === o.cle ? "white" : COULEURS.rouge, color: onglet === o.cle ? COULEURS.rouge : "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 800 }}>{nbRetards}</span>
              )}
              {o.cle === "entretien" && alertesEntretien.length > 0 && (
                <span style={{ marginLeft: 5, background: onglet === o.cle ? "white" : COULEURS.ambre, color: onglet === o.cle ? COULEURS.ambre : "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 800 }}>{alertesEntretien.length}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {!donnees.charge && <div style={{ textAlign: "center", color: COULEURS.grisClair, padding: 50 }}>Chargement…</div>}

      {donnees.charge && (
        <div style={S.section}>
          {alertesEntretien.length > 0 && onglet !== "entretien" && (
            <div style={{ ...S.carte, background: "#FBF3E3", border: "1px solid #F0DDA8", cursor: "pointer" }} onClick={() => setOnglet("entretien")}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#8A6412" }}>⚠️ {alertesEntretien.length} entretien{alertesEntretien.length > 1 ? "s" : ""} à faire bientôt ou en retard</div>
              <div style={{ fontSize: 11.5, color: "#8A6412", marginTop: 2 }}>Voir dans l'onglet Entretien →</div>
            </div>
          )}

          {onglet === "calendrier" && <OngletCalendrier workspace={workspace} donnees={donnees} gestionnaire={gestionnaire} monNom={monNom} />}
          {onglet === "retours" && <OngletRetours workspace={workspace} donnees={donnees} gestionnaire={gestionnaire} monNom={monNom} />}
          {onglet === "contrat" && <OngletContrat workspace={workspace} donnees={donnees} monNom={monNom} />}
          {onglet === "etats_lieux" && <OngletEtatsLieux workspace={workspace} donnees={donnees} gestionnaire={gestionnaire} monNom={monNom} />}
          {onglet === "entretien" && <OngletEntretien workspace={workspace} donnees={donnees} gestionnaire={gestionnaire} alertes={alertesEntretien} />}
          {onglet === "reservations" && <OngletReservations workspace={workspace} donnees={donnees} gestionnaire={gestionnaire} monNom={monNom} />}
          {onglet === "ventes" && <OngletVentesVehicule workspace={workspace} vehiculesVente={donnees.vehiculesVente} gestionnaire={gestionnaire} recharger={donnees.recharger} />}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ONGLET 1 — Calendrier de disponibilité automatique par véhicule.
// ============================================================================
function statutVehiculeAujourdhui(bien, commandesDuBien) {
  if (bien.disponible === false) return { cle: "hors_service", label: "Hors service", couleur: COULEURS.gris, fond: "#F1EFE8" };
  const auj = ajourdhuiISO();
  const occupeAujourdhui = commandesDuBien.some((c) => statutBloquant(c.statut) && c.date_debut_location <= auj && c.date_fin_location >= auj);
  if (occupeAujourdhui) return { cle: "loue", label: "Loué aujourd'hui", couleur: COULEURS.rouge, fond: "#FBEAE6" };
  const dans7j = new Date(); dans7j.setDate(dans7j.getDate() + 7);
  const dans7jISO = `${dans7j.getFullYear()}-${String(dans7j.getMonth() + 1).padStart(2, "0")}-${String(dans7j.getDate()).padStart(2, "0")}`;
  const bientot = commandesDuBien.some((c) => statutBloquant(c.statut) && c.date_debut_location > auj && c.date_debut_location <= dans7jISO);
  if (bientot) return { cle: "bientot", label: "Réservé bientôt", couleur: COULEURS.ambre, fond: "#FBF3E3" };
  return { cle: "libre", label: "Libre", couleur: "#1F9D6E", fond: "#EAF7F1" };
}

function OngletCalendrier({ workspace, donnees, gestionnaire, monNom }) {
  const { biens, commandes, recharger } = donnees;
  const [bienId, setBienId] = useState(biens[0]?.id || "");
  const [moisAffiche, setMoisAffiche] = useState(() => { const d = new Date(); return { annee: d.getFullYear(), mois: d.getMonth() }; });
  const [jourOuvert, setJourOuvert] = useState(null); // { iso, commande | null }
  const [formReservation, setFormReservation] = useState(null); // { dateDebut }

  useEffect(() => { if (!bienId && biens.length > 0) setBienId(biens[0].id); }, [biens, bienId]);

  const bienChoisi = biens.find((b) => b.id === bienId);
  const commandesDuBien = useMemo(() => commandes.filter((c) => c.bien_location_id === bienId && statutBloquant(c.statut)), [commandes, bienId]);

  if (biens.length === 0) {
    return <div style={S.carte}><div style={{ textAlign: "center", color: COULEURS.grisClair, padding: "20px 0" }}>Ajoute d'abord un véhicule dans « Véhicules/Matériel ».</div></div>;
  }

  const nbJoursMois = dernierJourDuMois(moisAffiche.annee, moisAffiche.mois);
  const premierJourSemaine = new Date(moisAffiche.annee, moisAffiche.mois, 1).getDay(); // 0=dimanche
  const decalage = (premierJourSemaine + 6) % 7; // lundi=0
  const auj = ajourdhuiISO();

  function commandePourJour(iso) {
    return commandesDuBien.find((c) => c.date_debut_location <= iso && c.date_fin_location >= iso) || null;
  }

  function cliquerJour(jour) {
    const iso = versISOLocal(moisAffiche.annee, moisAffiche.mois, jour);
    const c = commandePourJour(iso);
    if (c) { setJourOuvert({ iso, commande: c }); return; }
    if (bienChoisi && bienChoisi.disponible !== false && gestionnaire) {
      setFormReservation({ dateDebut: iso });
    } else {
      setJourOuvert({ iso, commande: null });
    }
  }

  const statutVeh = bienChoisi ? statutVehiculeAujourdhui(bienChoisi, commandesDuBien) : null;

  return (
    <div>
      <div style={S.carte}>
        <select value={bienId} onChange={(e) => setBienId(e.target.value)} style={{ ...S.champ, marginBottom: 10, fontWeight: 700 }}>
          {biens.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        {statutVeh && (
          <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, color: statutVeh.couleur, background: statutVeh.fond, padding: "4px 10px", borderRadius: 999 }}>
            {statutVeh.cle === "libre" ? "✅" : statutVeh.cle === "loue" ? "🔴" : statutVeh.cle === "bientot" ? "🟠" : "⛔"} {statutVeh.label}
          </span>
        )}
      </div>

      <div style={S.carte}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => setMoisAffiche((m) => { const d = new Date(m.annee, m.mois - 1, 1); return { annee: d.getFullYear(), mois: d.getMonth() }; })} style={{ ...S.boutonClair, padding: "7px 12px" }}>←</button>
          <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>
            {new Date(moisAffiche.annee, moisAffiche.mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setMoisAffiche((m) => { const d = new Date(m.annee, m.mois + 1, 1); return { annee: d.getFullYear(), mois: d.getMonth() }; })} style={{ ...S.boutonClair, padding: "7px 12px" }}>→</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 10.5, color: COULEURS.grisClair, textAlign: "center", marginBottom: 4 }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => <div key={i}>{j}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {Array.from({ length: decalage }).map((_, i) => <div key={"vide" + i} />)}
          {Array.from({ length: nbJoursMois }).map((_, i) => {
            const jour = i + 1;
            const iso = versISOLocal(moisAffiche.annee, moisAffiche.mois, jour);
            const c = commandePourJour(iso);
            const horsService = bienChoisi && bienChoisi.disponible === false;
            const estAuj = iso === auj;
            let fond = "#F4F1E8", couleurTexte = COULEURS.vertFonce;
            if (horsService) { fond = "#E5E2D8"; couleurTexte = COULEURS.grisClair; }
            else if (c) { fond = "#FBEAE6"; couleurTexte = COULEURS.rougeFonce; }
            return (
              <div
                key={jour}
                onClick={() => cliquerJour(jour)}
                style={{
                  aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, background: fond, color: couleurTexte, fontSize: 12, fontWeight: estAuj ? 800 : 600,
                  border: estAuj ? `2px solid ${COULEURS.vert}` : "1px solid transparent", cursor: "pointer",
                }}
              >
                {jour}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", fontSize: 10.5, color: COULEURS.gris }}>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "#F4F1E8", marginRight: 4 }} />Libre</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "#FBEAE6", marginRight: 4 }} />Loué</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "#E5E2D8", marginRight: 4 }} />Hors service</span>
        </div>
      </div>

      {jourOuvert && (
        <FenetreDetailJour
          jourOuvert={jourOuvert}
          currency={devise(workspace.currency)}
          onClose={() => setJourOuvert(null)}
        />
      )}

      {formReservation && bienChoisi && (
        <FormulaireNouvelleReservation
          workspace={workspace}
          bien={bienChoisi}
          commandes={commandes}
          dateDebutInitiale={formReservation.dateDebut}
          onClose={() => setFormReservation(null)}
          onCree={async () => { setFormReservation(null); await recharger(); }}
        />
      )}
    </div>
  );
}

function FenetreDetailJour({ jourOuvert, currency, onClose }) {
  const c = jourOuvert.commande;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtDate(jourOuvert.iso)}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {c ? (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div><strong>{c.client}</strong> · {c.tel}</div>
            <div style={{ color: COULEURS.gris }}>Du {fmtDate(c.date_debut_location)} au {fmtDate(c.date_fin_location)}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: COULEURS.vert, marginTop: 6 }}>{nb(c.montant)} {currency}</div>
          </div>
        ) : (
          <div style={{ color: COULEURS.grisClair, fontSize: 13 }}>Jour indisponible (véhicule hors service).</div>
        )}
      </div>
    </div>
  );
}

// Démarre une réservation pré-remplie depuis un clic sur un jour libre du calendrier.
function FormulaireNouvelleReservation({ workspace, bien, commandes, dateDebutInitiale, onClose, onCree }) {
  const [client, setClient] = useState("");
  const [tel, setTel] = useState("");
  const [dateDebut, setDateDebut] = useState(dateDebutInitiale);
  const [dateFin, setDateFin] = useState(dateDebutInitiale);
  const [acompte, setAcompte] = useState("");
  const [caution, setCaution] = useState(bien.caution_suggeree ? String(bien.caution_suggeree) : "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const nbJours = dateDebut && dateFin ? joursLocation(dateDebut, dateFin) : 0;
  const montant = nbJours * Number(bien.prix_jour || 0);
  const conflit = dateDebut && dateFin ? verifierChevauchement(commandes, bien.id, dateDebut, dateFin) : null;
  const formValide = client.trim() && tel.trim() && dateDebut && dateFin && nbJours > 0;

  async function creer() {
    if (!formValide) return;
    if (conflit) { setErreur(messageChevauchement(conflit)); return; }
    setEnCours(true);
    setErreur("");
    const montantPaye = acompte ? Math.min(Number(acompte), montant) : 0;
    const { data, error } = await supabase.from("commandes").insert([{
      workspace_id: workspace.id, client: client.trim(), tel: tel.trim(),
      produit: `${bien.nom} (${nbJours} jour${nbJours > 1 ? "s" : ""})`,
      montant, zone: "", mode_vente: "sur_place", montant_paye: montantPaye,
      bien_location_id: bien.id, date_debut_location: dateDebut, date_fin_location: dateFin,
      caution: caution ? Number(caution) : null, statut: "en_cours",
    }]).select("id").maybeSingle();
    if (error) { setErreur("Erreur : " + error.message); setEnCours(false); return; }
    if (montantPaye > 0 && data?.id) {
      await supabase.from("paiements_commande").insert([{ workspace_id: workspace.id, commande_id: data.id, montant: montantPaye, mode_paiement: "cash", enregistre_par: "Réservation calendrier" }]);
    }
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Nouvelle réservation — {bien.nom}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <input placeholder="Nom du client" value={client} onChange={(e) => setClient(e.target.value)} style={S.champ} />
        <input placeholder="Téléphone" value={tel} onChange={(e) => setTel(e.target.value)} style={S.champ} />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 4 }}>Début</div>
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={{ ...S.champ, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 4 }}>Fin</div>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={{ ...S.champ, marginBottom: 0 }} />
          </div>
        </div>
        <input placeholder={`Acompte (${devise(workspace.currency)}, optionnel)`} type="number" value={acompte} onChange={(e) => setAcompte(e.target.value)} style={S.champ} />
        <input placeholder={`Caution (${devise(workspace.currency)}, optionnel)`} type="number" value={caution} onChange={(e) => setCaution(e.target.value)} style={S.champ} />

        {conflit && (
          <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 10, padding: "9px 11px", marginBottom: 10, fontSize: 12, color: COULEURS.rougeFonce }}>
            🚫 {messageChevauchement(conflit)}
          </div>
        )}
        {erreur && !conflit && <div style={{ color: COULEURS.rougeFonce, fontSize: 12, marginBottom: 8 }}>{erreur}</div>}

        {nbJours > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${COULEURS.bordure}`, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{nbJours} jour{nbJours > 1 ? "s" : ""}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: COULEURS.vert }}>{nb(montant)} {devise(workspace.currency)}</span>
          </div>
        )}
        <button onClick={creer} disabled={!formValide || enCours || !!conflit} style={{ ...S.bouton, width: "100%", opacity: (!formValide || enCours || conflit) ? 0.5 : 1 }}>
          {enCours ? "Création…" : "Créer la réservation"}
        </button>
      </div>
    </div>
  );
}

// Alertes d'entretien à faire bientôt (≤15 jours) ou en retard.
function calculerAlertesEntretien(entretiens, biens) {
  const auj = ajourdhuiISO();
  const dans15j = new Date(); dans15j.setDate(dans15j.getDate() + 15);
  const dans15jISO = `${dans15j.getFullYear()}-${String(dans15j.getMonth() + 1).padStart(2, "0")}-${String(dans15j.getDate()).padStart(2, "0")}`;
  return entretiens
    .filter((e) => e.echeance_date && e.echeance_date <= dans15jISO)
    .map((e) => ({ ...e, enRetard: e.echeance_date < auj, bienNom: (biens.find((b) => b.id === e.bien_id) || {}).nom || "Véhicule" }))
    .sort((a, b) => (a.echeance_date || "").localeCompare(b.echeance_date || ""));
}

// ============================================================================
//  ONGLET 2 — Locations en cours & retours (dont retards + pénalité).
// ============================================================================
function OngletRetours({ workspace, donnees, gestionnaire, monNom }) {
  const { commandes, biens, reglages, recharger } = donnees;
  const [commandeRetour, setCommandeRetour] = useState(null);
  const currency = devise(workspace.currency);
  const auj = ajourdhuiISO();
  const coefficient = Number(reglages?.coefficient_penalite_retard) || 1.5;

  const locationsActives = useMemo(() => {
    return commandes
      .filter((c) => statutBloquant(c.statut) && c.statut !== "retournee" && c.date_fin_location)
      .map((c) => {
        const bien = biens.find((b) => b.id === c.bien_location_id);
        const retard = c.date_fin_location < auj ? joursDeRetard(c.date_fin_location) : 0;
        const penalite = retard > 0 ? calculerPenaliteRetard(bien?.prix_jour, retard, coefficient) : 0;
        return { ...c, bien, retard, penalite, finAujourdhui: c.date_fin_location === auj };
      })
      .filter((c) => c.retard > 0 || c.finAujourdhui)
      .sort((a, b) => b.retard - a.retard);
  }, [commandes, biens, auj, coefficient]);

  const autresEnCours = useMemo(() => {
    return commandes.filter((c) => statutBloquant(c.statut) && c.statut !== "retournee" && c.date_fin_location && c.date_fin_location > auj);
  }, [commandes, auj]);

  function relancerWhatsApp(c) {
    const bien = biens.find((b) => b.id === c.bien_location_id);
    const texte = c.retard > 0
      ? `Bonjour ${(c.client || "").split(" ")[0]} 👋, ${bien?.nom || "le véhicule"} loué devait être rendu le ${fmtDate(c.date_fin_location)} (${c.retard} jour${c.retard > 1 ? "s" : ""} de retard). Merci de le ramener dès que possible.`
      : `Bonjour ${(c.client || "").split(" ")[0]} 👋, petit rappel : ${bien?.nom || "le véhicule"} loué est à rendre aujourd'hui (${fmtDate(c.date_fin_location)}). Merci !`;
    window.open(`https://wa.me/${cleanPhoneForWhatsApp(c.tel)}?text=${encodeURIComponent(texte)}`, "_blank");
  }

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>Coefficient de pénalité de retard</div>
        <div style={{ fontSize: 12, color: COULEURS.gris, marginBottom: 8 }}>Pénalité = prix/jour × jours de retard × coefficient.</div>
        <ReglagePenalite workspace={workspace} reglages={reglages} gestionnaire={gestionnaire} onEnregistre={recharger} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0 8px" }}>À rendre aujourd'hui / en retard ({locationsActives.length})</div>
      {locationsActives.length === 0 && <div style={{ ...S.carte, textAlign: "center", color: COULEURS.grisClair }}>Aucun retour attendu aujourd'hui ni en retard.</div>}
      {locationsActives.map((c) => (
        <div key={c.id} style={{ ...S.carte, borderColor: c.retard > 0 ? "#F0B8AC" : COULEURS.bordure, background: c.retard > 0 ? "#FFF9F7" : "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.client}</div>
              <div style={{ fontSize: 11.5, color: COULEURS.gris }}>{c.bien?.nom || "Véhicule"} · à rendre le {fmtDate(c.date_fin_location)}</div>
            </div>
            {c.retard > 0 ? (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: COULEURS.rougeFonce, background: "#FBEAE6", padding: "3px 9px", borderRadius: 999 }}>🔴 {c.retard} j de retard</span>
            ) : (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8A6412", background: "#FBF3E3", padding: "3px 9px", borderRadius: 999 }}>🟠 Retour aujourd'hui</span>
            )}
          </div>
          {c.penalite > 0 && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: COULEURS.rougeFonce, fontWeight: 700 }}>
              Pénalité calculée : {nb(c.penalite)} {currency} ({nb(c.bien?.prix_jour)} × {c.retard} j × {coefficient})
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => relancerWhatsApp(c)} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>💬 Rappeler le retour</button>
            {gestionnaire && <button onClick={() => setCommandeRetour(c)} style={{ flex: 1, background: COULEURS.vert, color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>✅ Marquer rendu</button>}
          </div>
        </div>
      ))}

      {autresEnCours.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: "18px 0 8px" }}>Autres locations en cours ({autresEnCours.length})</div>
          {autresEnCours.map((c) => {
            const bien = biens.find((b) => b.id === c.bien_location_id);
            return (
              <div key={c.id} style={S.carte}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.client}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.gris }}>{bien?.nom || "Véhicule"} · du {fmtDate(c.date_debut_location)} au {fmtDate(c.date_fin_location)}</div>
              </div>
            );
          })}
        </>
      )}

      {commandeRetour && (
        <FenetreMarquerRendu
          workspace={workspace}
          commande={commandeRetour}
          bien={biens.find((b) => b.id === commandeRetour.bien_location_id)}
          monNom={monNom}
          onClose={() => setCommandeRetour(null)}
          onValide={async () => { setCommandeRetour(null); await recharger(); }}
        />
      )}
    </div>
  );
}

function ReglagePenalite({ workspace, reglages, gestionnaire, onEnregistre }) {
  const [valeur, setValeur] = useState(String(reglages?.coefficient_penalite_retard ?? 1.5));
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { setValeur(String(reglages?.coefficient_penalite_retard ?? 1.5)); }, [reglages?.coefficient_penalite_retard]);

  async function enregistrer() {
    const v = Number(valeur);
    if (!(v >= 0)) return;
    setEnCours(true);
    await supabase.from("reglages_location_vehicule").upsert([{ workspace_id: workspace.id, coefficient_penalite_retard: v, updated_at: new Date().toISOString() }], { onConflict: "workspace_id" });
    setEnCours(false);
    onEnregistre();
  }

  if (!gestionnaire) return <div style={{ fontSize: 13, fontWeight: 700 }}>× {nb(reglages?.coefficient_penalite_retard ?? 1.5)}</div>;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input type="number" step="0.1" min="0" value={valeur} onChange={(e) => setValeur(e.target.value)} style={{ ...S.champ, marginBottom: 0, width: 100 }} />
      <button onClick={enregistrer} disabled={enCours} style={{ ...S.boutonClair, opacity: enCours ? 0.6 : 1 }}>Enregistrer</button>
    </div>
  );
}

function FenetreMarquerRendu({ workspace, commande, bien, monNom, onClose, onValide }) {
  const [km, setKm] = useState("");
  const [carburant, setCarburant] = useState("50");
  const [dommages, setDommages] = useState("");
  const [photos, setPhotos] = useState([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function ajouterPhotos(fichiers) {
    if (!fichiers || fichiers.length === 0) return;
    setEnvoiPhoto(true);
    const restantes = Math.max(0, 8 - photos.length);
    const liste = Array.from(fichiers).slice(0, restantes);
    for (const f of liste) {
      const compresse = await compresserImageLV(f);
      const chemin = `${workspace.id}/etats-lieux/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await supabase.storage.from("produits").upload(chemin, compresse, { upsert: true, contentType: "image/jpeg" });
      if (!error) {
        const { data } = supabase.storage.from("produits").getPublicUrl(chemin);
        setPhotos((p) => [...p, data.publicUrl]);
      }
    }
    setEnvoiPhoto(false);
  }

  async function valider() {
    setEnCours(true);
    await supabase.from("etats_lieux").insert([{
      workspace_id: workspace.id, commande_id: commande.id, bien_id: commande.bien_location_id,
      type: "retour", km: km ? Number(km) : null, carburant: carburant ? Number(carburant) : null,
      dommages: dommages.trim() || null, photos, fait_par: monNom,
    }]);
    await supabase.from("commandes").update({ statut: "retournee", date_retour: new Date().toISOString(), motif_retour: "Retour véhicule (état des lieux enregistré)" }).eq("id", commande.id);
    setEnCours(false);
    onValide();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>✅ Marquer rendu — {bien?.nom}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: COULEURS.gris, marginBottom: 10 }}>Client : {commande.client}. Ceci enregistre l'état des lieux de retour.</div>
        <input placeholder="Kilométrage au retour" type="number" value={km} onChange={(e) => setKm(e.target.value)} style={S.champ} />
        <div style={{ fontSize: 11, color: COULEURS.gris, marginBottom: 4 }}>Carburant au retour (%)</div>
        <input type="range" min="0" max="100" step="5" value={carburant} onChange={(e) => setCarburant(e.target.value)} style={{ width: "100%", marginBottom: 4 }} />
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{carburant}%</div>
        <textarea placeholder="Dommages constatés (optionnel)" value={dommages} onChange={(e) => setDommages(e.target.value)} rows={2} style={{ ...S.champ, fontFamily: "inherit" }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COULEURS.fond, border: "1px dashed #DDD8CC", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COULEURS.gris, cursor: "pointer", marginBottom: 10 }}>
          {envoiPhoto ? "Envoi..." : `📷 Ajouter des photos (${photos.length}/8)`}
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => ajouterPhotos(e.target.files)} disabled={photos.length >= 8} />
        </label>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${COULEURS.bordure}` }} />)}
          </div>
        )}
        <button onClick={valider} disabled={enCours} style={{ ...S.bouton, width: "100%", opacity: enCours ? 0.6 : 1 }}>{enCours ? "Enregistrement…" : "Confirmer le retour"}</button>
      </div>
    </div>
  );
}

// ============================================================================
//  ONGLET 3 — Contrat de location (PDF).
// ============================================================================
function OngletContrat({ workspace, donnees, monNom }) {
  const { commandes, biens, locationsInfos, etatsLieux } = donnees;
  const [commandeId, setCommandeId] = useState("");
  const currency = devise(workspace.currency);

  const locations = useMemo(() => commandes.filter((c) => c.bien_location_id).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [commandes]);
  const commande = locations.find((c) => c.id === commandeId) || locations[0];
  const bien = commande ? biens.find((b) => b.id === commande.bien_location_id) : null;
  const infosExistantes = commande ? locationsInfos.find((l) => l.commande_id === commande.id) : null;
  const etatDepart = commande ? etatsLieux.find((e) => e.commande_id === commande.id && e.type === "depart") : null;

  const [form, setForm] = useState({ numero_permis: "", numero_piece: "", adresse: "", conducteur_additionnel_nom: "", conducteur_additionnel_permis: "" });
  const [enCours, setEnCours] = useState(false);
  const [genere, setGenere] = useState(false);

  useEffect(() => {
    setForm({
      numero_permis: infosExistantes?.numero_permis || "",
      numero_piece: infosExistantes?.numero_piece || "",
      adresse: infosExistantes?.adresse || "",
      conducteur_additionnel_nom: infosExistantes?.conducteur_additionnel_nom || "",
      conducteur_additionnel_permis: infosExistantes?.conducteur_additionnel_permis || "",
    });
  }, [commande?.id]);

  async function enregistrerInfos() {
    if (!commande) return;
    setEnCours(true);
    await supabase.from("locations_infos").upsert([{
      workspace_id: workspace.id, commande_id: commande.id, ...form, created_by: monNom,
    }], { onConflict: "commande_id" });
    setEnCours(false);
  }

  function genererContratPDF() {
    if (!commande || !bien) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
    doc.setFillColor(...green); doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(workspace.name.toUpperCase(), 15, 17);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(workspace.country || "", 15, 24);
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("CONTRAT DE LOCATION", 195, 17, { align: "right" });

    let y = 42;
    doc.setTextColor(...dark); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("LOUEUR", 15, y); doc.text("LOCATAIRE", 110, y);
    y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(workspace.name || "", 15, y); doc.text(commande.client || "", 110, y);
    y += 5; doc.text(workspace.country || "", 15, y); doc.text(commande.tel || "", 110, y);
    if (form.numero_permis) { y += 5; doc.text(`Permis n° ${form.numero_permis}`, 110, y); }
    if (form.numero_piece) { y += 5; doc.text(`Pièce d'identité n° ${form.numero_piece}`, 110, y); }
    if (form.adresse) { y += 5; doc.text(form.adresse, 110, y, { maxWidth: 85 }); }
    if (form.conducteur_additionnel_nom) { y += 6; doc.setFont("helvetica", "bold"); doc.text("Conducteur additionnel", 110, y); doc.setFont("helvetica", "normal"); y += 5; doc.text(`${form.conducteur_additionnel_nom}${form.conducteur_additionnel_permis ? " — permis " + form.conducteur_additionnel_permis : ""}`, 110, y, { maxWidth: 85 }); }

    y += 12;
    doc.setFillColor(...green); doc.rect(15, y, 180, 8, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("VÉHICULE / MATÉRIEL", 18, y + 5.5);
    y += 8;
    doc.setDrawColor(230, 230, 225); doc.rect(15, y, 180, 26);
    doc.setTextColor(...dark); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(`${bien.nom} (${bien.categorie || ""})`, 18, y + 6);
    doc.text(`Période : du ${fmtDate(commande.date_debut_location)} au ${fmtDate(commande.date_fin_location)}`, 18, y + 12);
    doc.text(`Prix/jour : ${nb(bien.prix_jour)} ${currency}    Total : ${nb(commande.montant)} ${currency}`, 18, y + 18);
    doc.text(`Caution : ${nb(commande.caution || 0)} ${currency}    Déjà payé : ${nb(commande.montant_paye || 0)} ${currency}`, 18, y + 24);
    if (etatDepart) { y += 26; doc.text(`Km au départ : ${etatDepart.km ?? "—"}    Carburant au départ : ${etatDepart.carburant != null ? etatDepart.carburant + "%" : "—"}`, 18, y); }
    y += 14;

    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("CONDITIONS GÉNÉRALES", 15, y);
    y += 5; doc.setFont("helvetica", "normal"); doc.setFontSize(8.3); doc.setTextColor(...gray);
    const conditions = [
      "1. Le véhicule est loué en l'état, avec le niveau de carburant constaté à l'état des lieux de départ ; il doit être restitué avec le même niveau, sauf accord contraire.",
      "2. Le locataire est responsable des amendes, dommages et frais survenus pendant la durée de la location, sauf usure normale.",
      "3. Tout retour après l'heure/date convenue peut entraîner une pénalité de retard, calculée au prorata du prix/jour.",
      "4. La caution est restituée après vérification de l'état du véhicule au retour, déduction faite des dommages ou frais constatés.",
      "5. L'assurance applicable est celle du véhicule telle que souscrite par le loueur ; le locataire doit se conformer au code de la route en vigueur.",
    ];
    // Retour à la ligne manuel (pas de dépendance à splitTextToSize) : ~95 caractères tiennent
    // sur 180mm en Helvetica 8.3pt, une marge suffisante pour ce texte court et fixe.
    conditions.forEach((c) => { const lignes = decouperTexte(c, 95); lignes.forEach((l) => { doc.text(l, 15, y); y += 4; }); y += 2; });

    y += 8;
    doc.setDrawColor(200, 200, 195);
    doc.line(15, y, 85, y); doc.line(125, y, 195, y);
    doc.setFontSize(8.5); doc.setTextColor(...dark);
    doc.text("Signature du loueur", 15, y + 5); doc.text("Signature du locataire", 125, y + 5);

    doc.setFontSize(7.5); doc.setTextColor(...gray);
    doc.text("Document généré automatiquement — modèle indicatif, sans valeur juridique garantie. Adapte-le à la réglementation locale si besoin.", 105, 290, { align: "center" });

    doc.save(`Contrat-${(bien.nom || "vehicule").replace(/\s+/g, "-")}-${commande.id.slice(0, 6)}.pdf`);
    setGenere(true);
  }

  if (locations.length === 0) return <div style={S.carte}><div style={{ textAlign: "center", color: COULEURS.grisClair, padding: "20px 0" }}>Aucune location pour l'instant.</div></div>;

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>Choisir la location</div>
        <select value={commande?.id || ""} onChange={(e) => setCommandeId(e.target.value)} style={S.champ}>
          {locations.map((c) => {
            const b = biens.find((x) => x.id === c.bien_location_id);
            return <option key={c.id} value={c.id}>{c.client} — {b?.nom} ({fmtDate(c.date_debut_location)})</option>;
          })}
        </select>
      </div>

      {commande && bien && (
        <>
          <div style={S.carte}>
            <div style={S.titre}>Informations complémentaires (contrat)</div>
            <input placeholder="Numéro de permis" value={form.numero_permis} onChange={(e) => setForm({ ...form, numero_permis: e.target.value })} style={S.champ} />
            <input placeholder="Numéro de pièce d'identité" value={form.numero_piece} onChange={(e) => setForm({ ...form, numero_piece: e.target.value })} style={S.champ} />
            <input placeholder="Adresse du client" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} style={S.champ} />
            <input placeholder="Conducteur additionnel (nom, optionnel)" value={form.conducteur_additionnel_nom} onChange={(e) => setForm({ ...form, conducteur_additionnel_nom: e.target.value })} style={S.champ} />
            <input placeholder="Conducteur additionnel (permis, optionnel)" value={form.conducteur_additionnel_permis} onChange={(e) => setForm({ ...form, conducteur_additionnel_permis: e.target.value })} style={S.champ} />
            <button onClick={enregistrerInfos} disabled={enCours} style={{ ...S.boutonClair, width: "100%" }}>{enCours ? "Enregistrement…" : "Enregistrer ces informations"}</button>
          </div>

          <div style={S.carte}>
            <div style={S.titre}>Récapitulatif</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
              <div>{bien.nom} — {commande.client}</div>
              <div style={{ color: COULEURS.gris }}>Du {fmtDate(commande.date_debut_location)} au {fmtDate(commande.date_fin_location)}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: COULEURS.vert }}>{nb(commande.montant)} {currency} · Caution {nb(commande.caution || 0)} {currency}</div>
            </div>
            <button onClick={genererContratPDF} style={{ ...S.bouton, width: "100%", marginTop: 10 }}>📄 Générer le contrat PDF</button>
            {genere && <div style={{ fontSize: 11.5, color: COULEURS.vert, marginTop: 6, textAlign: "center" }}>✅ Contrat téléchargé.</div>}
            <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginTop: 8, textAlign: "center" }}>Modèle indicatif — vérifie la conformité avec la réglementation locale avant usage professionnel.</div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
//  ONGLET 4 — États des lieux (départ / retour), comparaison et impression.
// ============================================================================
function OngletEtatsLieux({ workspace, donnees, gestionnaire, monNom }) {
  const { commandes, biens, etatsLieux, recharger } = donnees;
  const [commandeId, setCommandeId] = useState("");
  const locations = useMemo(() => commandes.filter((c) => c.bien_location_id).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [commandes]);
  const commande = locations.find((c) => c.id === commandeId) || locations[0];
  const bien = commande ? biens.find((b) => b.id === commande.bien_location_id) : null;
  const depart = commande ? etatsLieux.filter((e) => e.commande_id === commande.id && e.type === "depart").slice(-1)[0] : null;
  const retour = commande ? etatsLieux.filter((e) => e.commande_id === commande.id && e.type === "retour").slice(-1)[0] : null;
  const [formType, setFormType] = useState(null); // 'depart' | 'retour'

  function imprimer() {
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) return;
    const ligne = (label, a, b) => `<tr><td style="padding:4px 8px;color:#666">${label}</td><td style="padding:4px 8px;font-weight:700">${a ?? "—"}</td><td style="padding:4px 8px;font-weight:700">${b ?? "—"}</td></tr>`;
    w.document.write(`
      <html><head><title>État des lieux</title></head>
      <body style="font-family:sans-serif;padding:16px;">
        <h2>État des lieux — ${bien?.nom || ""}</h2>
        <div>${commande?.client || ""} — du ${fmtDate(commande?.date_debut_location)} au ${fmtDate(commande?.date_fin_location)}</div>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          <tr><th></th><th style="text-align:left;padding:4px 8px">Départ</th><th style="text-align:left;padding:4px 8px">Retour</th></tr>
          ${ligne("Kilométrage", depart?.km, retour?.km)}
          ${ligne("Carburant (%)", depart?.carburant, retour?.carburant)}
          ${ligne("Dommages", depart?.dommages || "Aucun", retour?.dommages || "Aucun")}
        </table>
        ${depart?.km != null && retour?.km != null ? `<p><strong>Kilomètres parcourus :</strong> ${retour.km - depart.km} km</p>` : ""}
        ${depart?.carburant != null && retour?.carburant != null ? `<p><strong>Écart carburant :</strong> ${depart.carburant - retour.carburant} points</p>` : ""}
        <script>window.print();</script>
      </body></html>
    `);
    w.document.close();
  }

  if (locations.length === 0) return <div style={S.carte}><div style={{ textAlign: "center", color: COULEURS.grisClair, padding: "20px 0" }}>Aucune location pour l'instant.</div></div>;

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>Choisir la location</div>
        <select value={commande?.id || ""} onChange={(e) => setCommandeId(e.target.value)} style={S.champ}>
          {locations.map((c) => {
            const b = biens.find((x) => x.id === c.bien_location_id);
            return <option key={c.id} value={c.id}>{c.client} — {b?.nom} ({fmtDate(c.date_debut_location)})</option>;
          })}
        </select>
      </div>

      {commande && (
        <div style={S.carte}>
          <div style={S.titre}>Comparaison départ / retour</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BlocEtatLieux titre="🚗 Départ" e={depart} onCreer={gestionnaire ? () => setFormType("depart") : null} />
            <BlocEtatLieux titre="↩️ Retour" e={retour} onCreer={gestionnaire ? () => setFormType("retour") : null} />
          </div>
          {depart && retour && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: COULEURS.fond, borderRadius: 10, fontSize: 12.5 }}>
              {depart.km != null && retour.km != null && <div>📏 Kilomètres parcourus : <strong>{retour.km - depart.km} km</strong></div>}
              {depart.carburant != null && retour.carburant != null && <div>⛽ Écart carburant : <strong>{depart.carburant - retour.carburant} points</strong></div>}
            </div>
          )}
          {(depart || retour) && <button onClick={imprimer} style={{ ...S.boutonClair, width: "100%", marginTop: 10 }}>🖨️ Imprimer / PDF l'état des lieux</button>}
        </div>
      )}

      {formType && commande && (
        <FormulaireEtatLieux
          workspace={workspace}
          commande={commande}
          bien={bien}
          type={formType}
          monNom={monNom}
          onClose={() => setFormType(null)}
          onValide={async () => { setFormType(null); await recharger(); }}
        />
      )}
    </div>
  );
}

function BlocEtatLieux({ titre, e, onCreer }) {
  return (
    <div style={{ border: `1px solid ${COULEURS.bordure}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>{titre}</div>
      {e ? (
        <div style={{ fontSize: 11.5, color: COULEURS.gris, lineHeight: 1.7 }}>
          <div>Km : <strong style={{ color: COULEURS.vertFonce }}>{e.km ?? "—"}</strong></div>
          <div>Carburant : <strong style={{ color: COULEURS.vertFonce }}>{e.carburant != null ? e.carburant + "%" : "—"}</strong></div>
          {e.dommages && <div>Dommages : {e.dommages}</div>}
          {Array.isArray(e.photos) && e.photos.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {e.photos.slice(0, 4).map((p, i) => <img key={i} src={p} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Pas encore fait.</div>
      )}
      {!e && onCreer && <button onClick={onCreer} style={{ ...S.boutonClair, width: "100%", marginTop: 8, padding: "7px 0", fontSize: 11.5 }}>+ Enregistrer</button>}
    </div>
  );
}

function FormulaireEtatLieux({ workspace, commande, bien, type, monNom, onClose, onValide }) {
  const [km, setKm] = useState("");
  const [carburant, setCarburant] = useState("100");
  const [dommages, setDommages] = useState("");
  const [photos, setPhotos] = useState([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function ajouterPhotos(fichiers) {
    if (!fichiers || fichiers.length === 0) return;
    setEnvoiPhoto(true);
    const restantes = Math.max(0, 8 - photos.length);
    for (const f of Array.from(fichiers).slice(0, restantes)) {
      const compresse = await compresserImageLV(f);
      const chemin = `${workspace.id}/etats-lieux/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await supabase.storage.from("produits").upload(chemin, compresse, { upsert: true, contentType: "image/jpeg" });
      if (!error) { const { data } = supabase.storage.from("produits").getPublicUrl(chemin); setPhotos((p) => [...p, data.publicUrl]); }
    }
    setEnvoiPhoto(false);
  }

  async function valider() {
    setEnCours(true);
    await supabase.from("etats_lieux").insert([{
      workspace_id: workspace.id, commande_id: commande.id, bien_id: commande.bien_location_id,
      type, km: km ? Number(km) : null, carburant: carburant ? Number(carburant) : null,
      dommages: dommages.trim() || null, photos, fait_par: monNom,
    }]);
    setEnCours(false);
    onValide();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{type === "depart" ? "🚗 État des lieux — départ" : "↩️ État des lieux — retour"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <input placeholder="Kilométrage" type="number" value={km} onChange={(e) => setKm(e.target.value)} style={S.champ} />
        <div style={{ fontSize: 11, color: COULEURS.gris, marginBottom: 4 }}>Carburant (%)</div>
        <input type="range" min="0" max="100" step="5" value={carburant} onChange={(e) => setCarburant(e.target.value)} style={{ width: "100%", marginBottom: 4 }} />
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{carburant}%</div>
        <textarea placeholder="Dommages constatés (optionnel)" value={dommages} onChange={(e) => setDommages(e.target.value)} rows={2} style={{ ...S.champ, fontFamily: "inherit" }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COULEURS.fond, border: "1px dashed #DDD8CC", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COULEURS.gris, cursor: "pointer", marginBottom: 10 }}>
          {envoiPhoto ? "Envoi..." : `📷 Ajouter des photos (${photos.length}/8)`}
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => ajouterPhotos(e.target.files)} disabled={photos.length >= 8} />
        </label>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />)}
          </div>
        )}
        <button onClick={valider} disabled={enCours} style={{ ...S.bouton, width: "100%", opacity: enCours ? 0.6 : 1 }}>{enCours ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

// ============================================================================
//  ONGLET 5 — Entretien, documents & rentabilité par véhicule.
// ============================================================================
const TYPES_ENTRETIEN = { vidange: "🛢️ Vidange", assurance: "📋 Assurance", visite_technique: "🔍 Visite technique", pneus: "🛞 Pneus", autre: "🔧 Autre" };

function OngletEntretien({ workspace, donnees, gestionnaire, alertes }) {
  const { biens, entretiens, commandes, recharger } = donnees;
  const [formOuvert, setFormOuvert] = useState(false);
  const [periode, setPeriode] = useState("90"); // jours

  const rentabilite = useMemo(() => {
    const auj = new Date();
    const debutPeriode = new Date(auj.getTime() - Number(periode) * 86400000);
    return biens.map((b) => {
      const revenus = commandes
        .filter((c) => c.bien_location_id === b.id && new Date(c.created_at || 0) >= debutPeriode)
        .reduce((s, c) => s + Number(c.montant_paye || 0), 0);
      const couts = entretiens
        .filter((e) => e.bien_id === b.id && e.date_fait && new Date(e.date_fait) >= debutPeriode)
        .reduce((s, e) => s + Number(e.cout || 0), 0);
      return { bien: b, revenus, couts, rentabilite: revenus - couts };
    });
  }, [biens, commandes, entretiens, periode]);

  return (
    <div>
      {alertes.length > 0 && (
        <div style={{ ...S.carte, background: "#FBF3E3", border: "1px solid #F0DDA8" }}>
          <div style={S.titre}>⚠️ Alertes entretien</div>
          {alertes.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 12.5 }}>
              <span>{TYPES_ENTRETIEN[a.type] || a.type} — {a.bienNom}</span>
              <span style={{ fontWeight: 700, color: a.enRetard ? COULEURS.rougeFonce : "#8A6412" }}>{a.enRetard ? "En retard" : "Bientôt"} ({fmtDate(a.echeance_date)})</span>
            </div>
          ))}
        </div>
      )}

      {gestionnaire && (
        <button onClick={() => setFormOuvert(true)} style={{ ...S.bouton, width: "100%", marginBottom: 14 }}>+ Enregistrer un entretien</button>
      )}

      <div style={S.carte}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={S.titre}>Rentabilité par véhicule</div>
          <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12 }}>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
            <option value="365">12 derniers mois</option>
          </select>
        </div>
        {rentabilite.map((r) => (
          <div key={r.bien.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COULEURS.bordure}` }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.bien.nom}</div>
              <div style={{ fontSize: 10.5, color: COULEURS.grisClair }}>Revenus {nb(r.revenus)} − Entretien {nb(r.couts)}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: r.rentabilite >= 0 ? COULEURS.vert : COULEURS.rougeFonce }}>{nb(r.rentabilite)} {devise(workspace.currency)}</div>
          </div>
        ))}
        {rentabilite.length === 0 && <div style={{ color: COULEURS.grisClair, fontSize: 12.5 }}>Aucun véhicule.</div>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0 8px" }}>Historique d'entretien</div>
      {entretiens.length === 0 && <div style={{ ...S.carte, textAlign: "center", color: COULEURS.grisClair }}>Aucun entretien enregistré.</div>}
      {entretiens.map((e) => (
        <div key={e.id} style={S.carte}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{TYPES_ENTRETIEN[e.type] || e.type} — {(biens.find((b) => b.id === e.bien_id) || {}).nom}</div>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: COULEURS.vert }}>{nb(e.cout)} {devise(workspace.currency)}</div>
          </div>
          <div style={{ fontSize: 11, color: COULEURS.gris, marginTop: 4 }}>
            {e.date_fait && `Fait le ${fmtDate(e.date_fait)}`}{e.echeance_date && ` · Prochaine échéance : ${fmtDate(e.echeance_date)}`}
          </div>
          {e.note && <div style={{ fontSize: 11.5, color: COULEURS.gris, marginTop: 4 }}>{e.note}</div>}
        </div>
      ))}

      {formOuvert && (
        <FormulaireEntretien workspace={workspace} biens={biens} onClose={() => setFormOuvert(false)} onCree={async () => { setFormOuvert(false); await recharger(); }} />
      )}
    </div>
  );
}

function FormulaireEntretien({ workspace, biens, onClose, onCree }) {
  const [bienId, setBienId] = useState(biens[0]?.id || "");
  const [type, setType] = useState("vidange");
  const [dateFait, setDateFait] = useState(ajourdhuiISO());
  const [echeanceDate, setEcheanceDate] = useState("");
  const [echeanceKm, setEcheanceKm] = useState("");
  const [cout, setCout] = useState("");
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    if (!bienId) return;
    setEnCours(true);
    await supabase.from("entretiens_vehicule").insert([{
      workspace_id: workspace.id, bien_id: bienId, type,
      date_fait: dateFait || null, echeance_date: echeanceDate || null,
      echeance_km: echeanceKm ? Number(echeanceKm) : null, cout: cout ? Number(cout) : 0, note: note.trim() || null,
    }]);
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>+ Entretien</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <select value={bienId} onChange={(e) => setBienId(e.target.value)} style={S.champ}>
          {biens.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={S.champ}>
          {Object.entries(TYPES_ENTRETIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 4 }}>Fait le</div>
            <input type="date" value={dateFait} onChange={(e) => setDateFait(e.target.value)} style={{ ...S.champ }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 4 }}>Échéance</div>
            <input type="date" value={echeanceDate} onChange={(e) => setEcheanceDate(e.target.value)} style={{ ...S.champ }} />
          </div>
        </div>
        <input placeholder="Échéance en kilométrage (optionnel)" type="number" value={echeanceKm} onChange={(e) => setEcheanceKm(e.target.value)} style={S.champ} />
        <input placeholder={`Coût (${devise(workspace.currency)})`} type="number" value={cout} onChange={(e) => setCout(e.target.value)} style={S.champ} />
        <textarea placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...S.champ, fontFamily: "inherit" }} />
        <button onClick={creer} disabled={enCours} style={{ ...S.bouton, width: "100%" }}>{enCours ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

// ============================================================================
//  ONGLET 6 — Réservations & acompte + partage de la page de réservation publique.
// ============================================================================
function OngletReservations({ workspace, donnees, gestionnaire, monNom }) {
  const { commandes, biens } = donnees;
  const currency = devise(workspace.currency);
  const auj = ajourdhuiISO();
  const lienPublic = `${window.location.origin}/?location=${encodeURIComponent(workspace.slug || "")}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(lienPublic)}`;
  const [copie, setCopie] = useState(false);

  const locations = useMemo(() => commandes
    .filter((c) => c.bien_location_id)
    .map((c) => {
      let statut = "réservé";
      if (c.statut === "retournee") statut = "rendu";
      else if (c.date_debut_location && c.date_debut_location <= auj && (!c.date_fin_location || c.date_fin_location >= auj)) statut = "en cours";
      return { ...c, statutAffiche: statut, reste: Math.max(0, Number(c.montant) - Number(c.montant_paye || 0)) };
    })
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [commandes, auj]);

  async function copierLien() {
    try { await navigator.clipboard.writeText(lienPublic); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch (_) {}
  }

  if (!workspace.slug) {
    return (
      <div style={S.carte}>
        <div style={{ textAlign: "center", color: COULEURS.grisClair, padding: "10px 0" }}>
          Ta boutique n'a pas encore d'adresse (slug) publique. Configure-la dans « Ma Boutique » pour activer la page de réservation publique.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>📣 Ma page de réservation publique</div>
        <div style={{ fontSize: 12, color: COULEURS.gris, marginBottom: 10 }}>Partage ce lien : tes clients voient tes véhicules disponibles et peuvent réserver directement.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={qrUrl} alt="QR code de la page de réservation" width={96} height={96} style={{ borderRadius: 8, border: `1px solid ${COULEURS.bordure}`, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: COULEURS.gris, wordBreak: "break-all", marginBottom: 8 }}>{lienPublic}</div>
            <button onClick={copierLien} style={{ ...S.boutonClair, width: "100%" }}>{copie ? "✅ Copié" : "📋 Copier le lien"}</button>
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0 8px" }}>Réservations ({locations.length})</div>
      {locations.length === 0 && <div style={{ ...S.carte, textAlign: "center", color: COULEURS.grisClair }}>Aucune réservation pour l'instant.</div>}
      {locations.map((c) => {
        const bien = biens.find((b) => b.id === c.bien_location_id);
        const couleurStatut = c.statutAffiche === "rendu" ? "#1F9D6E" : c.statutAffiche === "en cours" ? COULEURS.ambre : COULEURS.bleu;
        const fondStatut = c.statutAffiche === "rendu" ? "#EAF7F1" : c.statutAffiche === "en cours" ? "#FBF3E3" : "#EAF0FB";
        return (
          <div key={c.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.client}</div>
                <div style={{ fontSize: 11, color: COULEURS.gris }}>{bien?.nom} · {fmtDate(c.date_debut_location)} → {fmtDate(c.date_fin_location)}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: couleurStatut, background: fondStatut, padding: "3px 9px", borderRadius: 999, textTransform: "capitalize" }}>{c.statutAffiche}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
              <span style={{ color: COULEURS.gris }}>Payé : <strong style={{ color: COULEURS.vertFonce }}>{nb(c.montant_paye)} {currency}</strong></span>
              <span style={{ color: c.reste > 0 ? COULEURS.rougeFonce : COULEURS.vert, fontWeight: 700 }}>{c.reste > 0 ? `Reste ${nb(c.reste)} ${currency}` : "Soldé"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  LOT 6 — Vente de véhicules : à côté de la location (LOT 4), sans y toucher.
//  Table : vehicules_vente, paiements_vehicule_vente (voir sql/lot6-vente-vehicule.sql).
//  Même logique que « Ventes » dans LocationMaison.jsx (immobilier) : nouvelle
//  table séparée, même modal, nouvel onglet.
// ============================================================================

const LIBELLE_STATUT_VV = { disponible: "🟢 Disponible", reserve: "🟠 Réservé", vendu: "✅ Vendu" };
const FOND_STATUT_VV = { disponible: "#EAF3DE", reserve: "#FBF3E3", vendu: "#EAF7F1" };
const COULEUR_STATUT_VV = { disponible: "#3B6D11", reserve: COULEURS.ambre, vendu: "#1F9D6E" };
const CARBURANTS_VV = [["essence", "Essence"], ["diesel", "Diesel"], ["hybride", "Hybride"], ["electrique", "Électrique"], ["autre", "Autre"]];
const BOITES_VV = [["manuelle", "Manuelle"], ["automatique", "Automatique"]];
const ETATS_VV = [["neuf", "Neuf"], ["occasion", "Occasion"]];
const ETAPES_VV = [
  ["infos", "Informations"], ["localisation", "Localisation"], ["caracteristiques", "Caractéristiques"],
  ["medias", "Photos & médias"], ["prix", "Prix & disponibilité"],
];

// Si la fiche est restée ouverte longtemps avant l'envoi (surtout pour une vidéo, plus longue à
// envoyer), la session de connexion peut avoir expiré entre-temps. On la rafraîchit juste avant
// pour éviter l'erreur technique "'exp' claim timestamp check failed".
async function assurerSessionFraicheVV() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 120000) {
      await supabase.auth.refreshSession();
    }
  } catch (_) { /* si le rafraîchissement échoue, on tente quand même l'envoi normalement */ }
}

async function envoyerFichierVV(file, workspaceId, prefixe) {
  await assurerSessionFraicheVV();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const chemin = `${workspaceId}/vente-vehicule-${prefixe}-${Date.now()}-${Math.round(Math.random() * 9999)}.${ext}`;
  const { error } = await supabase.storage.from("boutique").upload(chemin, file, { upsert: true, contentType: file.type || undefined });
  if (error) {
    const brut = error?.message || String(error || "");
    if (/exp.{0,20}claim|jwt expired|token expired|session.{0,10}expir/i.test(brut)) {
      throw new Error("Votre session a expiré (vous étiez resté sur cette page trop longtemps). Rechargez la page et réessayez l'envoi.");
    }
    throw error;
  }
  return supabase.storage.from("boutique").getPublicUrl(chemin).data.publicUrl;
}

// Publication d'une fiche publique — copie volontaire de PanneauPublierFiche (LocationMaison.jsx) :
// ce module est autonome et n'importe pas les composants d'un autre fichier plein écran.
function PanneauPublierFicheVV({ workspace, entite, onMaj }) {
  const [ouvert, setOuvert] = useState(false);
  const [stats, setStats] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const lien = urlFichePublique("vehicule_vente", entite.id);

  async function basculerPublie() {
    setEnCours(true);
    const nouveauPublie = !entite.publie;
    await supabase.from("vehicules_vente").update({ publie: nouveauPublie, statut_fiche: nouveauPublie ? "active" : "brouillon" }).eq("id", entite.id);
    setEnCours(false);
    await onMaj();
  }

  useEffect(() => {
    if (!ouvert || !entite.publie) return;
    supabase.rpc("stats_fiche_commerciale", { p_workspace_id: workspace.id, p_type_entite: "vehicule_vente", p_entite_id: entite.id })
      .then(({ data }) => setStats(data || null));
  }, [ouvert, entite.publie, entite.id]);

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOuvert(!ouvert)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>
        🔗 {entite.publie ? "Fiche publique" : "Publier"}
      </button>
      {ouvert && (
        <div style={{ background: "#F4F1E8", borderRadius: 10, padding: 12, marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", marginBottom: entite.publie ? 10 : 0 }}>
            <input type="checkbox" checked={!!entite.publie} disabled={enCours} onChange={basculerPublie} />
            Publier cette fiche (visible publiquement, sans compte)
          </label>
          {entite.publie && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <img src={urlQrFiche(lien)} alt="QR code de la fiche" style={{ width: 84, height: 84, borderRadius: 8, background: "white" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: COULEURS.grisClair, wordBreak: "break-all", marginBottom: 6 }}>{lien}</div>
                  <a href={messageWhatsAppPartageFiche(entite.titre_annonce || entite.nom, entite.prix_vente, devise(workspace.currency), lien)} target="_blank" rel="noopener noreferrer" style={{ background: "#25d366", color: "white", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>💬 Partager sur WhatsApp</a>
                </div>
              </div>
              {stats && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: COULEURS.gris }}>
                  <span>👁️ {stats.vues} vues</span><span>👤 {stats.prospects} prospects</span>
                  <span>❓ {stats.questions} questions</span><span>📅 {stats.rendez_vous} RDV</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FormVehiculeVente({ workspace, vehicule, onFermer, onEnregistre }) {
  const [etape, setEtape] = useState(0);
  const [form, setForm] = useState({
    nom: vehicule?.nom || "", titre_annonce: vehicule?.titre_annonce || "", description: vehicule?.description || "",
    marque: vehicule?.marque || "", modele: vehicule?.modele || "", version: vehicule?.version || "",
    annee: vehicule ? String(vehicule.annee || "") : "", kilometrage: vehicule ? String(vehicule.kilometrage || "") : "",
    carburant: vehicule?.carburant || "essence", boite_vitesse: vehicule?.boite_vitesse || "manuelle",
    transmission: vehicule?.transmission || "", puissance: vehicule?.puissance || "", couleur: vehicule?.couleur || "",
    nombre_places: vehicule ? String(vehicule.nombre_places || "") : "", nombre_portes: vehicule ? String(vehicule.nombre_portes || "") : "",
    etat: vehicule?.etat || "occasion", premiere_mise_circulation: vehicule?.premiere_mise_circulation || "",
    origine: vehicule?.origine || "", entretien: vehicule?.entretien || "", garantie: vehicule?.garantie || "",
    assurance: vehicule?.assurance || "", controle_technique: vehicule?.controle_technique || "",
    options: Array.isArray(vehicule?.options) ? vehicule.options.join(", ") : "",
    equipements: Array.isArray(vehicule?.equipements) ? vehicule.equipements.join(", ") : "",
    caracteristiques_personnalisees: Array.isArray(vehicule?.caracteristiques_personnalisees) ? vehicule.caracteristiques_personnalisees : [],
    pays: vehicule?.pays || "", ville: vehicule?.ville || "", commune: vehicule?.commune || "", quartier: vehicule?.quartier || "",
    adresse_precise: vehicule?.adresse_precise || "", points_de_repere: vehicule?.points_de_repere || "",
    adresse_publique_visible: vehicule?.adresse_publique_visible || false,
    photos: Array.isArray(vehicule?.photos) ? vehicule.photos : [], video_url: vehicule?.video_url || "",
    brochure_url: vehicule?.brochure_url || "", documents: Array.isArray(vehicule?.documents) ? vehicule.documents : [],
    prix_vente: vehicule ? String(vehicule.prix_vente || "") : "", prix_negociable: vehicule?.prix_negociable || false,
    disponibilite: vehicule?.disponibilite || "",
  });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  function maj(champs) { setForm((f) => ({ ...f, ...champs })); }
  function bascule(cle) { setForm((f) => ({ ...f, [cle]: !f[cle] })); }

  async function ajouterPhotos(fichiers) {
    if (!fichiers || fichiers.length === 0) return;
    setEnvoiEnCours(true); setErreur("");
    try {
      const urls = [];
      for (const f of Array.from(fichiers)) {
        const compresse = await compresserImageLV(f);
        urls.push(await envoyerFichierVV(compresse, workspace.id, "photo"));
      }
      setForm((fo) => ({ ...fo, photos: [...fo.photos, ...urls] }));
    } catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }
  function retirerPhoto(i) { setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) })); }
  function photoPrincipaleEnPremier(i) {
    setForm((f) => { const p = [...f.photos]; const [choisie] = p.splice(i, 1); return { ...f, photos: [choisie, ...p] }; });
  }
  async function envoyerBrochure(fichier) {
    if (!fichier) return;
    setEnvoiEnCours(true); setErreur("");
    try { maj({ brochure_url: await envoyerFichierVV(fichier, workspace.id, "brochure") }); }
    catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }
  async function ajouterDocument(fichier) {
    if (!fichier) return;
    setEnvoiEnCours(true); setErreur("");
    try {
      const url = await envoyerFichierVV(fichier, workspace.id, "doc");
      setForm((f) => ({ ...f, documents: [...f.documents, { nom: fichier.name, url }] }));
    } catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }
  function retirerDocument(i) { setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) })); }
  function ajouterCaracPerso() { setForm((f) => ({ ...f, caracteristiques_personnalisees: [...f.caracteristiques_personnalisees, { libelle: "", valeur: "" }] })); }
  function majCaracPerso(i, champ, valeur) { setForm((f) => ({ ...f, caracteristiques_personnalisees: f.caracteristiques_personnalisees.map((c, idx) => idx === i ? { ...c, [champ]: valeur } : c) })); }
  function retirerCaracPerso(i) { setForm((f) => ({ ...f, caracteristiques_personnalisees: f.caracteristiques_personnalisees.filter((_, idx) => idx !== i) })); }

  const nombre = (v) => v === "" ? null : Number(v);
  const listeDepuisTexte = (t) => t.split(",").map((s) => s.trim()).filter(Boolean);

  async function enregistrer() {
    setErreur("");
    if (!form.nom.trim() || !form.prix_vente) {
      setErreur("Le nom du véhicule et le prix de vente sont obligatoires.");
      setEtape(form.nom.trim() ? 4 : 0);
      return;
    }
    const payload = {
      nom: form.nom.trim(), titre_annonce: form.titre_annonce.trim() || null, description: form.description.trim() || null,
      marque: form.marque.trim() || null, modele: form.modele.trim() || null, version: form.version.trim() || null,
      annee: nombre(form.annee), kilometrage: nombre(form.kilometrage), carburant: form.carburant, boite_vitesse: form.boite_vitesse,
      transmission: form.transmission.trim() || null, puissance: form.puissance.trim() || null, couleur: form.couleur.trim() || null,
      nombre_places: nombre(form.nombre_places), nombre_portes: nombre(form.nombre_portes), etat: form.etat,
      premiere_mise_circulation: form.premiere_mise_circulation || null, origine: form.origine.trim() || null,
      entretien: form.entretien.trim() || null, garantie: form.garantie.trim() || null, assurance: form.assurance.trim() || null,
      controle_technique: form.controle_technique.trim() || null,
      options: listeDepuisTexte(form.options), equipements: listeDepuisTexte(form.equipements),
      caracteristiques_personnalisees: form.caracteristiques_personnalisees.filter((c) => c.libelle.trim()),
      pays: form.pays.trim() || null, ville: form.ville.trim() || null, commune: form.commune.trim() || null, quartier: form.quartier.trim() || null,
      adresse_precise: form.adresse_precise.trim() || null, points_de_repere: form.points_de_repere.trim() || null,
      adresse_publique_visible: !!form.adresse_publique_visible,
      photos: form.photos, photo_url: form.photos[0] || null, video_url: form.video_url.trim() || null,
      brochure_url: form.brochure_url || null, documents: form.documents,
      prix_vente: Number(form.prix_vente) || 0, prix_negociable: !!form.prix_negociable, disponibilite: form.disponibilite.trim() || null,
    };
    setEnCours(true);
    const { error } = vehicule
      ? await supabase.from("vehicules_vente").update(payload).eq("id", vehicule.id)
      : await supabase.from("vehicules_vente").insert([{ ...payload, workspace_id: workspace.id, statut: "disponible" }]);
    setEnCours(false);
    if (error) { setErreur("Erreur : " + error.message); return; }
    onEnregistre();
  }

  const dernierIndex = ETAPES_VV.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{vehicule ? "Modifier ce véhicule" : "Nouveau véhicule à vendre"}</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
          {ETAPES_VV.map(([k, l], i) => (
            <div key={k} onClick={() => setEtape(i)} style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 99, cursor: "pointer", background: i === etape ? COULEURS.vertFonce : "#F1EFE8", color: i === etape ? "white" : COULEURS.grisClair }}>{i + 1}. {l}</div>
          ))}
        </div>

        {etape === 0 && (
          <>
            <input style={S.champ} placeholder="Nom interne (ex: Corolla 2023 blanche)" value={form.nom} onChange={(e) => maj({ nom: e.target.value })} />
            <input style={S.champ} placeholder="Titre de l'annonce (ex: Toyota Corolla 2023 — 38 000 km)" value={form.titre_annonce} onChange={(e) => maj({ titre_annonce: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Marque" value={form.marque} onChange={(e) => maj({ marque: e.target.value })} />
              <input style={S.champ} placeholder="Modèle" value={form.modele} onChange={(e) => maj({ modele: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Version (optionnel)" value={form.version} onChange={(e) => maj({ version: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Année" value={form.annee} onChange={(e) => maj({ annee: e.target.value })} />
            </div>
            <textarea style={{ ...S.champ, minHeight: 60 }} placeholder="Description (optionnel)" value={form.description} onChange={(e) => maj({ description: e.target.value })} />
          </>
        )}

        {etape === 1 && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 4 }}>Localisation publique</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Pays" value={form.pays} onChange={(e) => maj({ pays: e.target.value })} />
              <input style={S.champ} placeholder="Ville" value={form.ville} onChange={(e) => maj({ ville: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Commune" value={form.commune} onChange={(e) => maj({ commune: e.target.value })} />
              <input style={S.champ} placeholder="Quartier" value={form.quartier} onChange={(e) => maj({ quartier: e.target.value })} />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, margin: "10px 0 4px" }}>Localisation privée (équipe seulement)</div>
            <input style={S.champ} placeholder="Adresse précise" value={form.adresse_precise} onChange={(e) => maj({ adresse_precise: e.target.value })} />
            <input style={S.champ} placeholder="Points de repère" value={form.points_de_repere} onChange={(e) => maj({ points_de_repere: e.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COULEURS.gris, marginTop: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={form.adresse_publique_visible} onChange={() => bascule("adresse_publique_visible")} />
              Autoriser à montrer l'adresse précise publiquement plus tard
            </label>
          </>
        )}

        {etape === 2 && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={S.champ} value={form.carburant} onChange={(e) => maj({ carburant: e.target.value })}>{CARBURANTS_VV.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <select style={S.champ} value={form.boite_vitesse} onChange={(e) => maj({ boite_vitesse: e.target.value })}>{BOITES_VV.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} type="number" placeholder="Kilométrage" value={form.kilometrage} onChange={(e) => maj({ kilometrage: e.target.value })} />
              <select style={S.champ} value={form.etat} onChange={(e) => maj({ etat: e.target.value })}>{ETATS_VV.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Transmission (traction/propulsion/4x4)" value={form.transmission} onChange={(e) => maj({ transmission: e.target.value })} />
              <input style={S.champ} placeholder="Puissance" value={form.puissance} onChange={(e) => maj({ puissance: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Couleur" value={form.couleur} onChange={(e) => maj({ couleur: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Places" value={form.nombre_places} onChange={(e) => maj({ nombre_places: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Portes" value={form.nombre_portes} onChange={(e) => maj({ nombre_portes: e.target.value })} />
            </div>
            <input style={S.champ} type="date" placeholder="1ère mise en circulation" value={form.premiere_mise_circulation} onChange={(e) => maj({ premiere_mise_circulation: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Origine" value={form.origine} onChange={(e) => maj({ origine: e.target.value })} />
              <input style={S.champ} placeholder="Entretien" value={form.entretien} onChange={(e) => maj({ entretien: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Garantie" value={form.garantie} onChange={(e) => maj({ garantie: e.target.value })} />
              <input style={S.champ} placeholder="Assurance" value={form.assurance} onChange={(e) => maj({ assurance: e.target.value })} />
            </div>
            <input style={S.champ} placeholder="Contrôle technique" value={form.controle_technique} onChange={(e) => maj({ controle_technique: e.target.value })} />
            <input style={S.champ} placeholder="Options (séparées par des virgules)" value={form.options} onChange={(e) => maj({ options: e.target.value })} />
            <input style={S.champ} placeholder="Équipements (séparés par des virgules)" value={form.equipements} onChange={(e) => maj({ equipements: e.target.value })} />
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, margin: "10px 0 4px" }}>Autres caractéristiques (optionnel)</div>
            {form.caracteristiques_personnalisees.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input style={{ ...S.champ, marginBottom: 0, flex: 1 }} placeholder="Ex: Carte grise" value={c.libelle} onChange={(e) => majCaracPerso(i, "libelle", e.target.value)} />
                <input style={{ ...S.champ, marginBottom: 0, flex: 1 }} placeholder="Ex: Disponible" value={c.valeur} onChange={(e) => majCaracPerso(i, "valeur", e.target.value)} />
                <button onClick={() => retirerCaracPerso(i)} style={{ background: "none", border: "none", color: COULEURS.rougeFonce, cursor: "pointer", fontSize: 15 }}>🗑️</button>
              </div>
            ))}
            <button onClick={ajouterCaracPerso} style={{ ...S.boutonClair, width: "100%", padding: "7px 0", fontSize: 12, marginBottom: 8 }}>+ Ajouter une caractéristique</button>
          </>
        )}

        {etape === 3 && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 6 }}>Photos ({form.photos.length}) — la première sera la photo principale</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {form.photos.map((url, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={url} alt="" onClick={() => photoPrincipaleEnPremier(i)} style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: i === 0 ? `2px solid ${COULEURS.vert}` : "1px solid #E5E2D8" }} />
                  <button onClick={() => retirerPhoto(i)} style={{ position: "absolute", top: -6, right: -6, background: COULEURS.rougeFonce, color: "white", border: "none", borderRadius: 99, width: 18, height: 18, fontSize: 11, cursor: "pointer", lineHeight: "18px" }}>×</button>
                </div>
              ))}
            </div>
            <label style={{ ...S.boutonClair, display: "block", textAlign: "center", cursor: "pointer", marginBottom: 10 }}>
              {envoiEnCours ? "Envoi…" : "📷 Ajouter des photos"}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => ajouterPhotos(e.target.files)} disabled={envoiEnCours} />
            </label>
            <input style={S.champ} placeholder="Lien vidéo (YouTube, Facebook...)" value={form.video_url} onChange={(e) => maj({ video_url: e.target.value })} />
            <label style={{ ...S.boutonClair, display: "block", textAlign: "center", cursor: "pointer", marginBottom: 8 }}>
              {form.brochure_url ? "✓ Brochure ajoutée" : "📄 Ajouter une brochure"}
              <input type="file" accept=".pdf,image/*" hidden onChange={(e) => envoyerBrochure(e.target.files[0])} disabled={envoiEnCours} />
            </label>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 6 }}>Autres documents (carte grise, facture...)</div>
            {form.documents.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                <span>📎 {d.nom}</span>
                <button onClick={() => retirerDocument(i)} style={{ background: "none", border: "none", color: COULEURS.rougeFonce, cursor: "pointer" }}>🗑️</button>
              </div>
            ))}
            <label style={{ ...S.boutonClair, display: "block", textAlign: "center", cursor: "pointer" }}>
              {envoiEnCours ? "Envoi…" : "+ Ajouter un document"}
              <input type="file" hidden onChange={(e) => ajouterDocument(e.target.files[0])} disabled={envoiEnCours} />
            </label>
          </>
        )}

        {etape === 4 && (
          <>
            <input style={S.champ} type="number" placeholder={`Prix de vente (${devise(workspace.currency)})`} value={form.prix_vente} onChange={(e) => maj({ prix_vente: e.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COULEURS.gris, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.prix_negociable} onChange={() => bascule("prix_negociable")} />
              Prix négociable
            </label>
            <input style={S.champ} placeholder="Disponibilité (ex: Immédiate)" value={form.disponibilite} onChange={(e) => maj({ disponibilite: e.target.value })} />
          </>
        )}

        {erreur && <div style={{ background: "#FBEAE6", color: COULEURS.rougeFonce, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, margin: "8px 0" }}>{erreur}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {etape > 0 && <button onClick={() => setEtape(etape - 1)} style={{ ...S.boutonClair, flex: 1 }}>← Précédent</button>}
          {etape < dernierIndex && <button onClick={() => setEtape(etape + 1)} style={{ ...S.bouton, flex: 1 }}>Suivant →</button>}
          {etape === dernierIndex && <button disabled={enCours} onClick={enregistrer} style={{ ...S.bouton, flex: 1, opacity: enCours ? 0.6 : 1 }}>{enCours ? "…" : "Enregistrer"}</button>}
        </div>
        {etape === 0 && <button onClick={onFermer} style={{ ...S.boutonClair, width: "100%", marginTop: 8 }}>Annuler</button>}
      </div>
    </div>
  );
}

function FormReserverVendreVV({ workspace, vehicule, statutCible, onFermer, onEnregistre }) {
  const [form, setForm] = useState({ acheteur_nom: vehicule.acheteur_nom || "", acheteur_tel: vehicule.acheteur_tel || "", acheteur_email: vehicule.acheteur_email || "", date_vente: ajourdhuiISO() });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const estVente = statutCible === "vendu";

  async function enregistrer() {
    setErreur("");
    if (!form.acheteur_nom.trim()) { setErreur("Le nom de l'acheteur est obligatoire."); return; }
    setEnCours(true);
    const { error } = await supabase.from("vehicules_vente").update({
      statut: statutCible, acheteur_nom: form.acheteur_nom.trim(), acheteur_tel: form.acheteur_tel.trim() || null,
      acheteur_email: form.acheteur_email.trim() || null, date_vente: estVente ? form.date_vente : null,
    }).eq("id", vehicule.id);
    setEnCours(false);
    if (error) { setErreur("Erreur : " + error.message); return; }
    onEnregistre();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{estVente ? "Marquer vendu" : "Réserver ce véhicule"}</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 12 }}>{vehicule.nom}</div>
        <input style={S.champ} placeholder="Nom de l'acheteur" value={form.acheteur_nom} onChange={(e) => setForm({ ...form, acheteur_nom: e.target.value })} />
        <input style={S.champ} placeholder="Téléphone (optionnel)" value={form.acheteur_tel} onChange={(e) => setForm({ ...form, acheteur_tel: e.target.value })} />
        <input style={S.champ} placeholder="Email (optionnel)" value={form.acheteur_email} onChange={(e) => setForm({ ...form, acheteur_email: e.target.value })} />
        {estVente && (
          <>
            <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Date de vente</label>
            <input style={S.champ} type="date" value={form.date_vente} onChange={(e) => setForm({ ...form, date_vente: e.target.value })} />
          </>
        )}
        {erreur && <div style={{ background: "#FBEAE6", color: COULEURS.rougeFonce, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginBottom: 8 }}>{erreur}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={enCours} onClick={enregistrer} style={{ ...S.bouton, flex: 1, opacity: enCours ? 0.6 : 1 }}>{enCours ? "…" : "Confirmer"}</button>
          <button onClick={onFermer} style={{ ...S.boutonClair, flex: 1 }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function ModalPaiementsVV({ workspace, vehicule, onFermer, onMaj, genererRecuVenteVV }) {
  const [paiements, setPaiements] = useState([]);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("especes");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const reste = Math.max(0, Number(vehicule.prix_vente) - Number(vehicule.montant_recu || 0));

  const charger = useCallback(async () => {
    const { data } = await supabase.from("paiements_vehicule_vente").select("*").eq("vehicule_vente_id", vehicule.id).order("date_paiement", { ascending: false });
    setPaiements(data || []);
  }, [vehicule.id]);
  useEffect(() => { charger(); }, [charger]);

  async function encaisser() {
    setErreur("");
    const m = Number(montant);
    if (!m || m <= 0) { setErreur("Indique un montant valide."); return; }
    if (m > reste + 0.01) { setErreur(`Ce montant dépasse le reste à payer (${nb(reste)} ${devise(workspace.currency)}).`); return; }
    setEnCours(true);
    const { error } = await supabase.from("paiements_vehicule_vente").insert([{ vehicule_vente_id: vehicule.id, workspace_id: workspace.id, montant: m, mode, date_paiement: ajourdhuiISO() }]);
    setEnCours(false);
    if (error) { setErreur(error.message.includes("dépasse") ? error.message : "Erreur : " + error.message); return; }
    setMontant(""); await charger(); await onMaj();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{vehicule.nom}</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 10 }}>Prix {nb(vehicule.prix_vente)} {devise(workspace.currency)}, déjà reçu {nb(vehicule.montant_recu)} {devise(workspace.currency)}</div>
        {reste > 0 ? (
          <div style={{ background: "#F4F1E8", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Encaisser (reste {nb(reste)} {devise(workspace.currency)})</div>
            <input style={S.champ} type="number" placeholder="Montant reçu" value={montant} onChange={(e) => setMontant(e.target.value)} />
            <select style={S.champ} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="virement">Virement</option><option value="autre">Autre</option>
            </select>
            <button onClick={() => setMontant(String(reste))} style={{ ...S.boutonClair, width: "100%", marginBottom: 8, padding: "8px 0", fontSize: 12 }}>Payer le solde ({nb(reste)})</button>
            {erreur && <div style={{ color: COULEURS.rougeFonce, fontSize: 12, marginBottom: 8 }}>{erreur}</div>}
            <button disabled={enCours} onClick={encaisser} style={{ ...S.bouton, width: "100%" }}>{enCours ? "…" : "✅ Encaisser"}</button>
          </div>
        ) : (
          <div style={{ background: "#EAF7F1", color: "#1F9D6E", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>Ce véhicule est intégralement payé.</div>
        )}
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Historique des paiements</div>
        {paiements.length === 0 && <div style={{ fontSize: 12.5, color: COULEURS.grisClair }}>Aucun paiement enregistré.</div>}
        {paiements.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #F1EFE8" }}>
            <span>{new Date(p.date_paiement).toLocaleDateString("fr-FR")} · {p.mode}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{nb(p.montant)} {devise(workspace.currency)}</span>
              {genererRecuVenteVV && <button onClick={() => genererRecuVenteVV(p, vehicule)} style={{ background: "none", border: "none", color: COULEURS.vert, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>🧾 Reçu</button>}
            </span>
          </div>
        ))}
        <button onClick={onFermer} style={{ ...S.boutonClair, width: "100%", marginTop: 12 }}>Fermer</button>
      </div>
    </div>
  );
}

function genererRecuVenteVehiculePDF(paiement, vehicule, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60];
  doc.setFillColor(...green); doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  const estSolde = Number(paiement.montant) >= Number(vehicule.prix_vente) - Number(vehicule.montant_recu) + Number(paiement.montant) - 0.01 && Number(vehicule.montant_recu) >= Number(vehicule.prix_vente) - 0.01;
  doc.text(estSolde ? "REÇU POUR SOLDE DE TOUT COMPTE" : "REÇU DE VENTE (ACOMPTE)", 15, 14);
  doc.setTextColor(22, 35, 31); doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  let y = 34;
  doc.text(`Vendeur : ${workspace.name || ""}`, 15, y); y += 7;
  doc.text(`Véhicule : ${vehicule.nom}${vehicule.marque ? " (" + vehicule.marque + " " + (vehicule.modele || "") + ")" : ""}`, 15, y); y += 7;
  doc.text(`Acheteur : ${vehicule.acheteur_nom || ""}${vehicule.acheteur_tel ? " — " + vehicule.acheteur_tel : ""}`, 15, y); y += 7;
  doc.text(`Date : ${new Date(paiement.date_paiement).toLocaleDateString("fr-FR")} · Mode : ${paiement.mode || ""}`, 15, y); y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(`Montant reçu : ${nb(paiement.montant)} ${devise(workspace.currency)}`, 15, y); y += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Total payé à ce jour : ${nb(vehicule.montant_recu)} / ${nb(vehicule.prix_vente)} ${devise(workspace.currency)}`, 15, y);
  doc.save(`recu-vente-vehicule-${(vehicule.acheteur_nom || vehicule.nom || "vehicule").replace(/\s+/g, "-")}.pdf`);
}

function genererBonVenteVehiculePDF(vehicule, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  doc.setFillColor(...green); doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("BON DE VENTE — VÉHICULE", 15, 17);
  let y = 36;
  doc.setTextColor(...dark); doc.setFontSize(10); doc.setFont("helvetica", "normal");
  [
    `Vendeur : ${workspace.name || ""}${workspace.country ? " (" + workspace.country + ")" : ""}`,
    `Acheteur : ${vehicule.acheteur_nom || ""}${vehicule.acheteur_tel ? " — " + vehicule.acheteur_tel : ""}${vehicule.acheteur_email ? " — " + vehicule.acheteur_email : ""}`,
  ].forEach((l) => { doc.text(l, 15, y, { maxWidth: 180 }); y += 7; });
  y += 3;
  doc.setFont("helvetica", "bold"); doc.text("1. Véhicule vendu", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const caracs = [vehicule.marque, vehicule.modele, vehicule.annee ? `(${vehicule.annee})` : null, vehicule.kilometrage ? `${nb(vehicule.kilometrage)} km` : null].filter(Boolean).join(" ");
  doc.text(`${vehicule.nom}${caracs ? " — " + caracs : ""}`, 15, y, { maxWidth: 180 }); y += 10;
  doc.setFont("helvetica", "bold"); doc.text("2. Prix et modalités", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const prix = Number(vehicule.prix_vente || 0), recu = Number(vehicule.montant_recu || 0);
  doc.text(`Prix convenu : ${nb(prix)} ${devise(workspace.currency)}. Déjà reçu : ${nb(recu)} ${devise(workspace.currency)}${recu < prix ? `, reste ${nb(prix - recu)} ${devise(workspace.currency)}` : " (intégralement payé)"}.`, 15, y, { maxWidth: 180 }); y += 10;
  doc.setFont("helvetica", "bold"); doc.text("3. Date de vente", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(vehicule.date_vente ? new Date(vehicule.date_vente).toLocaleDateString("fr-FR") : "Non renseignée.", 15, y); y += 10;
  doc.setFont("helvetica", "bold"); doc.text("4. Conditions générales", 15, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  ["L'acheteur reconnaît avoir vu et essayé (si applicable) le véhicule, et l'accepter en l'état.",
   "Le transfert de propriété définitif intervient après paiement intégral et remise des documents (carte grise...).",
  ].forEach((c) => { doc.text("• " + c, 15, y, { maxWidth: 180 }); y += 6; });
  doc.setFontSize(10);
  y += 10; doc.setDrawColor(...gray); doc.line(15, y, 85, y); doc.line(125, y, 195, y);
  doc.setFontSize(9); doc.text("Signature du vendeur", 15, y + 5); doc.text("Signature de l'acheteur", 125, y + 5);
  y += 20; doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...gray);
  doc.text("Modèle indicatif — à adapter selon la réglementation locale (carte grise, contrôle technique...).", 15, y, { maxWidth: 180 });
  doc.save(`bon-vente-vehicule-${(vehicule.acheteur_nom || vehicule.nom || "vehicule").replace(/\s+/g, "-")}.pdf`);
}

function OngletVentesVehicule({ workspace, vehiculesVente, gestionnaire, recharger }) {
  const [filtre, setFiltre] = useState("tous");
  const [formOuvert, setFormOuvert] = useState(null);
  const [reservationOuverte, setReservationOuverte] = useState(null);
  const [paiementsOuvert, setPaiementsOuvert] = useState(null);

  const stats = useMemo(() => {
    const disponibles = vehiculesVente.filter((v) => v.statut === "disponible").length;
    const reserves = vehiculesVente.filter((v) => v.statut === "reserve").length;
    const vendus = vehiculesVente.filter((v) => v.statut === "vendu");
    const valeurStock = vehiculesVente.filter((v) => v.statut !== "vendu").reduce((s, v) => s + Number(v.prix_vente || 0), 0);
    const resteAEncaisser = vendus.reduce((s, v) => s + Math.max(0, Number(v.prix_vente) - Number(v.montant_recu || 0)), 0);
    return { disponibles, reserves, vendus: vendus.length, valeurStock, resteAEncaisser };
  }, [vehiculesVente]);

  const filtres = vehiculesVente.filter((v) => filtre === "tous" || v.statut === filtre);

  return (
    <div>
      <div style={{ ...S.carte, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tuile label="Disponibles" valeur={String(stats.disponibles)} />
        <Tuile label="Réservés" valeur={String(stats.reserves)} couleur={COULEURS.ambre} />
        <Tuile label="Vendus" valeur={String(stats.vendus)} couleur={COULEURS.vert} />
        <Tuile label="Valeur du stock" valeur={`${nb(stats.valeurStock)} ${devise(workspace.currency)}`} />
        {stats.resteAEncaisser > 0 && <Tuile label="Reste à encaisser" valeur={`${nb(stats.resteAEncaisser)} ${devise(workspace.currency)}`} couleur={COULEURS.rouge} />}
      </div>

      {gestionnaire && (
        <div style={S.carte}>
          <button onClick={() => setFormOuvert("new")} style={{ ...S.bouton, width: "100%" }}>+ Ajouter un véhicule à vendre</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {[["tous", "Tous"], ["disponible", "Disponibles"], ["reserve", "Réservés"], ["vendu", "Vendus"]].map(([k, l]) => (
          <div key={k} onClick={() => setFiltre(k)} style={{ ...S.onglet(filtre === k), flex: "1 1 auto", minWidth: 90 }}>{l}</div>
        ))}
      </div>

      {filtres.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun véhicule dans ce filtre.</div>}

      {filtres.map((v) => {
        const reste = Math.max(0, Number(v.prix_vente) - Number(v.montant_recu || 0));
        return (
          <div key={v.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 10 }}>
              {(v.photos?.[0] || v.photo_url) && <img src={v.photos?.[0] || v.photo_url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{v.titre_annonce || v.nom}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>
                  {[v.marque, v.modele].filter(Boolean).join(" ")}{v.annee ? ` · ${v.annee}` : ""}{v.kilometrage ? ` · ${nb(v.kilometrage)} km` : ""}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: COULEURS.vert, marginTop: 6 }}>
                  {nb(v.prix_vente)} {devise(workspace.currency)}{v.prix_negociable ? " (négociable)" : ""}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: FOND_STATUT_VV[v.statut], color: COULEUR_STATUT_VV[v.statut], whiteSpace: "nowrap" }}>{LIBELLE_STATUT_VV[v.statut]}</span>
            </div>
            {(v.statut === "reserve" || v.statut === "vendu") && (
              <div style={{ fontSize: 12.5, color: COULEURS.vertFonce, marginBottom: 6 }}>
                Acheteur : <strong>{v.acheteur_nom}</strong>{v.acheteur_tel ? ` · ${v.acheteur_tel}` : ""}
                {v.statut === "vendu" && <> · Reçu {nb(v.montant_recu)}{reste > 0 && <span style={{ color: COULEURS.rougeFonce, fontWeight: 700 }}> · Reste {nb(reste)}</span>} {devise(workspace.currency)}</>}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {gestionnaire && <button onClick={() => setFormOuvert(v)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>✏️ Modifier</button>}
              {gestionnaire && v.statut === "disponible" && <button onClick={() => setReservationOuverte({ vehicule: v, statutCible: "reserve" })} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>🤝 Réserver</button>}
              {gestionnaire && (v.statut === "disponible" || v.statut === "reserve") && <button onClick={() => setReservationOuverte({ vehicule: v, statutCible: "vendu" })} style={{ ...S.bouton, padding: "7px 12px", fontSize: 12 }}>✅ Marquer vendu</button>}
              {v.statut === "vendu" && <button onClick={() => setPaiementsOuvert(v)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>💰 Paiements</button>}
              {v.statut === "vendu" && <button onClick={() => genererBonVenteVehiculePDF(v, workspace)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>📄 Bon de vente PDF</button>}
            </div>
            {v.statut !== "vendu" && <PanneauPublierFicheVV workspace={workspace} entite={v} onMaj={recharger} />}
          </div>
        );
      })}

      {formOuvert && (
        <FormVehiculeVente workspace={workspace} vehicule={formOuvert === "new" ? null : formOuvert} onFermer={() => setFormOuvert(null)} onEnregistre={async () => { setFormOuvert(null); await recharger(); }} />
      )}
      {reservationOuverte && (
        <FormReserverVendreVV workspace={workspace} vehicule={reservationOuverte.vehicule} statutCible={reservationOuverte.statutCible} onFermer={() => setReservationOuverte(null)} onEnregistre={async () => { setReservationOuverte(null); await recharger(); }} />
      )}
      {paiementsOuvert && (
        <ModalPaiementsVV workspace={workspace} vehicule={vehiculesVente.find((v) => v.id === paiementsOuvert.id) || paiementsOuvert} onFermer={() => setPaiementsOuvert(null)} onMaj={recharger} genererRecuVenteVV={(p, v) => genererRecuVenteVehiculePDF(p, v, workspace)} />
      )}
    </div>
  );
}

// Petite tuile de statistique — copie du composant du même nom (LocationMaison.jsx / App.jsx),
// dupliquée volontairement (fichier autonome).
function Tuile({ label, valeur, couleur }) {
  return (
    <div style={{ flex: "1 1 100px", minWidth: 100 }}>
      <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: couleur || COULEURS.vertFonce }}>{valeur}</div>
    </div>
  );
}
