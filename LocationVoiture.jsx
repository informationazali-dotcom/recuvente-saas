import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import {
  verifierChevauchement, messageChevauchement, joursLocation, joursDeRetard,
  calculerPenaliteRetard, versDateLocale, statutBloquant,
} from "./locationVehiculeUtils.js";

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
    setCharge(true);
  }, [workspace?.id]);

  useEffect(() => { recharger(); }, [recharger]);

  return { biens, commandes, locationsInfos, etatsLieux, entretiens, reglages, charge, recharger, setReglages };
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
          <div style={{ fontWeight: 700, fontSize: 17 }}>🚗 Calendrier & locations</div>
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
