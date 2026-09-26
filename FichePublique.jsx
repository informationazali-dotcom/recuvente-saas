import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { urlQrFiche, messageWhatsAppPartageFiche, enregistrerEvenementFiche, idSessionFiche, cleanPhoneForWhatsAppFiche } from "./fichesCommercialesUtils.js";

// ============================================================================
//  LOT 7 — Fiche commerciale publique : mini-page présentant un bien immobilier
//  à vendre, un véhicule à vendre, ou un logement à louer, consultable par un
//  prospect SANS compte RecuVente. Chargée via "?fiche=<id>&type=<...>" (main.jsx).
//  Fichier autonome (comme CataloguePublic.jsx, ReservationPublique.jsx...) :
//  n'importe rien d'App.jsx, duplique ses propres petits utilitaires.
// ============================================================================

const COULEURS = {
  vert: "#1a7a3c", vertFonce: "#16231F", fond: "#FAFAF7", carte: "#FFFFFF",
  bordure: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", rougeFonce: "#B23A26",
  gris: "#6B7168", grisClair: "#8A9089",
};
function nb(x) { return Number(x || 0).toLocaleString("fr-FR"); }
function devise(code) { return code === "XOF" || code === "XAF" ? "F CFA" : (code || "F CFA"); }

const TYPES_DEMANDE = [
  ["acheter", "Je veux acheter"], ["louer", "Je veux louer"], ["visiter", "Je veux visiter"],
  ["negocier", "Je veux négocier"], ["plus_informations", "Plus d'informations"],
];

function caracteristiquesAffichees(f) {
  if (f.type_entite === "bien_vente") {
    return [
      ["Superficie habitable", f.superficie ? `${f.superficie} m²` : null],
      ["Superficie du terrain", f.superficie_terrain ? `${f.superficie_terrain} m²` : null],
      ["Pièces", f.nombre_pieces], ["Chambres", f.nombre_chambres], ["Salles de bain", f.nombre_salles_bain],
      ["Toilettes", f.nombre_toilettes], ["Étages", f.nombre_etages],
      ["Salon", f.salon ? "Oui" : null], ["Salle à manger", f.salle_a_manger ? "Oui" : null],
      ["Cuisine équipée", f.cuisine_equipee ? "Oui" : null], ["Garage", f.garage ? "Oui" : null],
      ["Parking", f.parking ? "Oui" : null], ["Balcon", f.balcon ? "Oui" : null], ["Terrasse", f.terrasse ? "Oui" : null],
      ["Jardin", f.jardin ? "Oui" : null], ["Piscine", f.piscine ? "Oui" : null], ["Dépendance", f.dependance ? "Oui" : null],
      ["Clôture", f.cloture ? "Oui" : null], ["Portail", f.portail ? "Oui" : null], ["Sécurité", f.securite ? "Oui" : null],
    ].filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== "");
  }
  if (f.type_entite === "vehicule_vente") {
    return [
      ["Marque", f.marque], ["Modèle", f.modele], ["Version", f.version], ["Année", f.annee],
      ["Kilométrage", f.kilometrage ? `${nb(f.kilometrage)} km` : null], ["Carburant", f.carburant],
      ["Boîte de vitesse", f.boite_vitesse], ["Transmission", f.transmission], ["Puissance", f.puissance],
      ["Couleur", f.couleur], ["Places", f.nombre_places], ["Portes", f.nombre_portes], ["État", f.etat],
      ["1ère mise en circulation", f.premiere_mise_circulation ? new Date(f.premiere_mise_circulation).toLocaleDateString("fr-FR") : null],
      ["Origine", f.origine], ["Entretien", f.entretien], ["Garantie", f.garantie], ["Assurance", f.assurance],
      ["Contrôle technique", f.controle_technique],
    ].filter(([, v]) => v !== null && v !== undefined && v !== "");
  }
  // logement (location)
  return [
    ["Superficie", f.superficie ? `${f.superficie} m²` : null], ["Pièces", f.nombre_pieces],
    ["Chambres", f.nombre_chambres], ["Salles de bain", f.nombre_salles_bain],
  ].filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== "");
}

function prixAffiche(f, wsDevise) {
  const d = devise(wsDevise);
  if (f.type_entite === "logement") return `${nb(f.loyer_mensuel)} ${d} / mois`;
  return `${nb(f.prix_vente)} ${d}${f.prix_negociable ? " (négociable)" : ""}`;
}

function ligneStatsClef(f) {
  if (f.type_entite === "bien_vente") {
    return [f.nombre_chambres ? `${f.nombre_chambres} chambres` : null, f.nombre_salles_bain ? `${f.nombre_salles_bain} SDB` : null, f.superficie ? `${f.superficie} m²` : null].filter(Boolean).join(" • ");
  }
  if (f.type_entite === "vehicule_vente") {
    return [f.annee, f.kilometrage ? `${nb(f.kilometrage)} km` : null, f.boite_vitesse === "automatique" ? "Automatique" : f.boite_vitesse === "manuelle" ? "Manuelle" : null, f.carburant].filter(Boolean).join(" • ");
  }
  return [f.nombre_chambres ? `${f.nombre_chambres} chambres` : null, f.superficie ? `${f.superficie} m²` : null].filter(Boolean).join(" • ");
}

function estUrlVideoIncorporable(url) {
  return /youtube\.com|youtu\.be/.test(url || "");
}
function urlVideoIncorporee(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export default function FichePublique({ ficheId, typeEntite }) {
  const [fiche, setFiche] = useState(null); // null = chargement, false = introuvable, objet = ok
  const [galerieIndex, setGalerieIndex] = useState(0);
  const [formulaireOuvert, setFormulaireOuvert] = useState(null); // "interesse" | "question" | "rdv" | null

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data } = await supabase.rpc("fiche_commerciale_public", { p_type_entite: typeEntite, p_entite_id: ficheId });
      if (annule) return;
      setFiche(data || false);
      if (data) {
        document.title = data.titre_annonce || data.entreprise_nom || "RecuVente";
        try {
          const clefVue = `rv_fiche_vue_${ficheId}`;
          if (!sessionStorage.getItem(clefVue)) {
            sessionStorage.setItem(clefVue, "1");
            enregistrerEvenementFiche(supabase, { workspaceId: data.workspace_id, typeEntite, entiteId: ficheId, evenement: "vue_page", source: new URLSearchParams(window.location.search).get("src") });
          }
        } catch (_) {}
      }
    })();
    return () => { annule = true; };
  }, [ficheId, typeEntite]);

  if (fiche === null) {
    return <div style={{ minHeight: "100vh", background: COULEURS.fond, display: "flex", alignItems: "center", justifyContent: "center", color: COULEURS.grisClair, fontFamily: "system-ui, sans-serif" }}>Chargement…</div>;
  }
  if (fiche === false) {
    return (
      <div style={{ minHeight: "100vh", background: COULEURS.fond, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 17, color: COULEURS.vertFonce, marginBottom: 6 }}>Cette fiche n'est plus disponible</div>
        <div style={{ fontSize: 13.5, color: COULEURS.grisClair }}>Elle a peut-être été retirée ou n'est plus publiée.</div>
      </div>
    );
  }

  const photos = Array.isArray(fiche.photos) && fiche.photos.length ? fiche.photos : (fiche.photo_url ? [fiche.photo_url] : []);
  const caracs = caracteristiquesAffichees(fiche);
  const localisationPublique = [fiche.quartier, fiche.commune, fiche.ville, fiche.pays].filter(Boolean).join(", ");
  const lienPage = typeof window !== "undefined" ? window.location.href.split("&src=")[0] : "";
  const optionsListe = Array.isArray(fiche.options) ? fiche.options : [];
  const equipementsListe = Array.isArray(fiche.equipements) ? fiche.equipements : [];
  const caracsPerso = Array.isArray(fiche.caracteristiques_personnalisees) ? fiche.caracteristiques_personnalisees.filter((c) => c.libelle) : [];
  const documents = Array.isArray(fiche.documents) ? fiche.documents : [];

  function suivre(evenement, source) {
    enregistrerEvenementFiche(supabase, { workspaceId: fiche.workspace_id, typeEntite, entiteId: ficheId, evenement, source });
  }

  return (
    <div style={{ minHeight: "100vh", background: COULEURS.fond, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 90 }}>
      {/* Galerie */}
      <div style={{ position: "relative", background: "#000" }}>
        {photos.length > 0 ? (
          <img src={photos[galerieIndex]} alt={fiche.titre_annonce} style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 220, background: "#EDEAE0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>📷</div>
        )}
        {photos.length > 1 && (
          <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
            {photos.map((_, i) => (
              <div key={i} onClick={() => setGalerieIndex(i)} style={{ width: 7, height: 7, borderRadius: 99, background: i === galerieIndex ? "white" : "rgba(255,255,255,0.45)", cursor: "pointer" }} />
            ))}
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "8px 16px", overflowX: "auto" }}>
          {photos.map((url, i) => (
            <img key={i} src={url} alt="" onClick={() => setGalerieIndex(i)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "pointer", border: i === galerieIndex ? `2px solid ${COULEURS.vert}` : "1px solid #E5E2D8", flexShrink: 0 }} />
          ))}
        </div>
      )}

      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontWeight: 800, fontSize: 19, color: COULEURS.vertFonce, lineHeight: 1.25 }}>{fiche.titre_annonce}</div>
        {ligneStatsClef(fiche) && <div style={{ fontSize: 13, color: COULEURS.gris, marginTop: 4 }}>{ligneStatsClef(fiche)}</div>}
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 22, color: COULEURS.vert, marginTop: 8 }}>{prixAffiche(fiche, fiche.devise)}</div>
        {fiche.disponibilite && <div style={{ fontSize: 12, color: COULEURS.grisClair, marginTop: 2 }}>Disponibilité : {fiche.disponibilite}</div>}

        {/* CTA */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
          <button onClick={() => { setFormulaireOuvert("interesse"); suivre("clic_interesse", "bouton_interesse"); }} style={{ flex: "1 1 160px", background: COULEURS.vert, color: "white", border: "none", borderRadius: 10, padding: "12px 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>✅ Je suis intéressé</button>
          <button onClick={() => setFormulaireOuvert("rdv")} style={{ flex: "1 1 160px", background: "white", color: COULEURS.vertFonce, border: `1px solid ${COULEURS.bordure}`, borderRadius: 10, padding: "12px 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>📅 Prendre rendez-vous</button>
          <button onClick={() => setFormulaireOuvert("question")} style={{ flex: "1 1 160px", background: "white", color: COULEURS.vertFonce, border: `1px solid ${COULEURS.bordure}`, borderRadius: 10, padding: "12px 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>❓ Poser une question</button>
          <a onClick={() => suivre("partage_whatsapp", "bouton_partage")} href={messageWhatsAppPartageFiche(fiche.titre_annonce, fiche.prix_vente ?? fiche.loyer_mensuel, devise(fiche.devise), lienPage)} target="_blank" rel="noopener noreferrer" style={{ flex: "1 1 160px", background: "#25d366", color: "white", borderRadius: 10, padding: "12px 14px", fontWeight: 700, fontSize: 13.5, textAlign: "center", textDecoration: "none" }}>💬 Partager sur WhatsApp</a>
        </div>

        {fiche.description && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 13, color: COULEURS.gris, whiteSpace: "pre-wrap" }}>{fiche.description}</div>
          </div>
        )}

        {caracs.length > 0 && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Caractéristiques</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px" }}>
              {caracs.map(([label, valeur]) => (
                <div key={label} style={{ fontSize: 12.5 }}><span style={{ color: COULEURS.grisClair }}>{label} : </span><strong>{String(valeur)}</strong></div>
              ))}
            </div>
            {caracsPerso.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COULEURS.bordure}` }}>
                {caracsPerso.map((c, i) => <div key={i} style={{ fontSize: 12.5 }}><span style={{ color: COULEURS.grisClair }}>{c.libelle} : </span><strong>{c.valeur}</strong></div>)}
              </div>
            )}
          </div>
        )}

        {(optionsListe.length > 0 || equipementsListe.length > 0) && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            {optionsListe.length > 0 && <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Options</div>}
            {optionsListe.length > 0 && <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: equipementsListe.length ? 10 : 0 }}>{optionsListe.join(" · ")}</div>}
            {equipementsListe.length > 0 && <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Équipements</div>}
            {equipementsListe.length > 0 && <div style={{ fontSize: 12.5, color: COULEURS.gris }}>{equipementsListe.join(" · ")}</div>}
          </div>
        )}

        {(localisationPublique || fiche.adresse_precise) && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>📍 Localisation</div>
            <div style={{ fontSize: 13, color: COULEURS.gris }}>{fiche.adresse_precise ? [fiche.adresse_precise, localisationPublique].filter(Boolean).join(", ") : (localisationPublique || "Zone communiquée après prise de contact.")}</div>
            {fiche.points_de_repere && <div style={{ fontSize: 12, color: COULEURS.grisClair, marginTop: 4 }}>Repère : {fiche.points_de_repere}</div>}
            {!fiche.adresse_precise && <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 4, fontStyle: "italic" }}>Adresse exacte communiquée après contact.</div>}
          </div>
        )}

        {fiche.video_url && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>🎬 Vidéo</div>
            {estUrlVideoIncorporable(fiche.video_url) && urlVideoIncorporee(fiche.video_url) ? (
              <div style={{ position: "relative", paddingTop: "56%" }}>
                <iframe src={urlVideoIncorporee(fiche.video_url)} title="Vidéo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", borderRadius: 8 }} allowFullScreen />
              </div>
            ) : (
              <a href={fiche.video_url} target="_blank" rel="noopener noreferrer" style={{ color: COULEURS.vert, fontWeight: 700, fontSize: 13 }}>▶ Voir la vidéo</a>
            )}
          </div>
        )}

        {(fiche.plan_url || fiche.brochure_url || documents.length > 0) && (
          <div style={{ background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>📎 Documents</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {fiche.plan_url && <a href={fiche.plan_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: COULEURS.vert }}>🗺️ Voir le plan</a>}
              {fiche.brochure_url && <a href={fiche.brochure_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: COULEURS.vert }}>📄 Télécharger la brochure</a>}
              {documents.map((d, i) => <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: COULEURS.vert }}>📎 {d.nom}</a>)}
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <img src={urlQrFiche(lienPage, 130)} alt="QR code" style={{ width: 90, height: 90, borderRadius: 8, opacity: 0.8 }} />
          <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginTop: 6 }}>{fiche.entreprise_nom}</div>
        </div>
      </div>

      {formulaireOuvert === "interesse" && <FormulaireInteresse fiche={fiche} typeEntite={typeEntite} ficheId={ficheId} onFermer={() => setFormulaireOuvert(null)} />}
      {formulaireOuvert === "question" && <FormulaireQuestion fiche={fiche} typeEntite={typeEntite} ficheId={ficheId} onFermer={() => setFormulaireOuvert(null)} />}
      {formulaireOuvert === "rdv" && <FormulaireRdv fiche={fiche} typeEntite={typeEntite} ficheId={ficheId} onFermer={() => setFormulaireOuvert(null)} />}
    </div>
  );
}

function ChampStyle() {
  return { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box", background: "white", marginBottom: 8 };
}

function EnveloppeFormulaire({ titre, onFermer, enfants }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{titre}</div>
          <button onClick={onFermer} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        {enfants}
      </div>
    </div>
  );
}

function FormulaireInteresse({ fiche, typeEntite, ficheId, onFermer }) {
  const champ = ChampStyle();
  const [f, setF] = useState({ nom: "", telephone: "", whatsapp: "", email: "", ville: "", quartier: "", type_demande: fiche.type_entite === "logement" ? "louer" : "acheter", budget: "", date_visite: "", commentaire: "" });
  const [statut, setStatut] = useState(null); // null | "envoi" | "ok" | erreur-texte
  async function envoyer() {
    if (!f.nom.trim() || !f.telephone.trim()) { setStatut("Indique ton nom et ton téléphone."); return; }
    setStatut("envoi");
    const { data } = await supabase.rpc("creer_prospect_fiche_public", {
      p_workspace_id: fiche.workspace_id, p_type_entite: typeEntite, p_entite_id: ficheId,
      p_nom: f.nom, p_telephone: f.telephone, p_whatsapp: f.whatsapp || null, p_email: f.email || null,
      p_ville: f.ville || null, p_quartier: f.quartier || null, p_type_demande: f.type_demande,
      p_budget: f.budget ? Number(f.budget) : null, p_date_visite: f.date_visite || null, p_commentaire: f.commentaire || null,
      p_source: "fiche_publique",
    });
    const r = Array.isArray(data) ? data[0] : data;
    setStatut(r?.succes ? "ok" : (r?.message || "Une erreur est survenue."));
  }
  if (statut === "ok") {
    return <EnveloppeFormulaire titre="Merci !" onFermer={onFermer} enfants={<div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 34 }}>✅</div><div style={{ fontWeight: 700, marginTop: 8 }}>Votre demande a bien été envoyée.</div><div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4 }}>Vous serez contacté(e) rapidement.</div></div>} />;
  }
  return (
    <EnveloppeFormulaire titre="Je suis intéressé(e)" onFermer={onFermer} enfants={
      <>
        <select style={champ} value={f.type_demande} onChange={(e) => setF({ ...f, type_demande: e.target.value })}>{TYPES_DEMANDE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input style={champ} placeholder="Nom complet *" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        <input style={champ} placeholder="Téléphone *" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
        <input style={champ} placeholder="WhatsApp (si différent, optionnel)" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
        <input style={champ} placeholder="Email (optionnel)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={champ} placeholder="Ville" value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} />
          <input style={champ} placeholder="Quartier" value={f.quartier} onChange={(e) => setF({ ...f, quartier: e.target.value })} />
        </div>
        <input style={champ} type="number" placeholder="Budget (optionnel)" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        <input style={champ} type="date" placeholder="Date souhaitée de visite" value={f.date_visite} onChange={(e) => setF({ ...f, date_visite: e.target.value })} />
        <textarea style={{ ...champ, minHeight: 60 }} placeholder="Commentaire (optionnel)" value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })} />
        {statut && statut !== "envoi" && <div style={{ color: "#B23A26", fontSize: 12.5, marginBottom: 8 }}>{statut}</div>}
        <button disabled={statut === "envoi"} onClick={envoyer} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, cursor: "pointer", opacity: statut === "envoi" ? 0.6 : 1 }}>{statut === "envoi" ? "Envoi…" : "Envoyer ma demande"}</button>
      </>
    } />
  );
}

function FormulaireQuestion({ fiche, typeEntite, ficheId, onFermer }) {
  const champ = ChampStyle();
  const [f, setF] = useState({ nom: "", telephone: "", question: "" });
  const [statut, setStatut] = useState(null);
  async function envoyer() {
    if (!f.telephone.trim() || !f.question.trim()) { setStatut("Indique ton téléphone et ta question."); return; }
    setStatut("envoi");
    const { data } = await supabase.rpc("poser_question_fiche_public", {
      p_workspace_id: fiche.workspace_id, p_type_entite: typeEntite, p_entite_id: ficheId,
      p_nom: f.nom || null, p_telephone: f.telephone, p_question: f.question,
    });
    const r = Array.isArray(data) ? data[0] : data;
    setStatut(r?.succes ? "ok" : (r?.message || "Une erreur est survenue."));
  }
  if (statut === "ok") {
    return <EnveloppeFormulaire titre="Merci !" onFermer={onFermer} enfants={<div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 34 }}>✅</div><div style={{ fontWeight: 700, marginTop: 8 }}>Ta question a bien été envoyée.</div></div>} />;
  }
  return (
    <EnveloppeFormulaire titre="Poser une question" onFermer={onFermer} enfants={
      <>
        <input style={champ} placeholder="Nom (optionnel)" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        <input style={champ} placeholder="Téléphone *" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
        <textarea style={{ ...champ, minHeight: 80 }} placeholder="Ta question (ex: le prix est-il négociable ?)" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        {statut && statut !== "envoi" && <div style={{ color: "#B23A26", fontSize: 12.5, marginBottom: 8 }}>{statut}</div>}
        <button disabled={statut === "envoi"} onClick={envoyer} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, cursor: "pointer", opacity: statut === "envoi" ? 0.6 : 1 }}>{statut === "envoi" ? "Envoi…" : "Envoyer la question"}</button>
      </>
    } />
  );
}

function FormulaireRdv({ fiche, typeEntite, ficheId, onFermer }) {
  const champ = ChampStyle();
  const typesParEntite = fiche.type_entite === "vehicule_vente" ? [["visite", "Voir le véhicule"], ["essai", "Essai routier"], ["rencontre", "Rencontrer le vendeur"]] : [["visite", "Visiter"], ["rencontre", "Rencontrer l'agent"]];
  const [f, setF] = useState({ nom: "", telephone: "", type_demande: typesParEntite[0][0], date: "", heure: "", commentaire: "" });
  const [statut, setStatut] = useState(null);
  async function envoyer() {
    if (!f.nom.trim() || !f.telephone.trim() || !f.date) { setStatut("Indique ton nom, ton téléphone et une date."); return; }
    setStatut("envoi");
    const { data } = await supabase.rpc("demander_rendez_vous_fiche_public", {
      p_workspace_id: fiche.workspace_id, p_type_entite: typeEntite, p_entite_id: ficheId,
      p_nom: f.nom, p_telephone: f.telephone, p_type_demande: f.type_demande, p_date: f.date,
      p_heure: f.heure || null, p_commentaire: f.commentaire || null,
    });
    const r = Array.isArray(data) ? data[0] : data;
    setStatut(r?.succes ? "ok" : (r?.message || "Une erreur est survenue."));
  }
  if (statut === "ok") {
    return <EnveloppeFormulaire titre="Merci !" onFermer={onFermer} enfants={<div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 34 }}>✅</div><div style={{ fontWeight: 700, marginTop: 8 }}>Ta demande de rendez-vous a bien été envoyée.</div><div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 4 }}>Le créneau sera confirmé par téléphone/WhatsApp.</div></div>} />;
  }
  return (
    <EnveloppeFormulaire titre="Prendre rendez-vous" onFermer={onFermer} enfants={
      <>
        <select style={champ} value={f.type_demande} onChange={(e) => setF({ ...f, type_demande: e.target.value })}>{typesParEntite.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input style={champ} placeholder="Nom complet *" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        <input style={champ} placeholder="Téléphone *" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...champ, flex: 1 }} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input style={{ ...champ, flex: 1 }} type="time" value={f.heure} onChange={(e) => setF({ ...f, heure: e.target.value })} />
        </div>
        <textarea style={{ ...champ, minHeight: 55 }} placeholder="Commentaire (optionnel)" value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })} />
        {statut && statut !== "envoi" && <div style={{ color: "#B23A26", fontSize: 12.5, marginBottom: 8 }}>{statut}</div>}
        <button disabled={statut === "envoi"} onClick={envoyer} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, cursor: "pointer", opacity: statut === "envoi" ? 0.6 : 1 }}>{statut === "envoi" ? "Envoi…" : "Demander ce rendez-vous"}</button>
      </>
    } />
  );
}
