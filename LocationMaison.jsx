import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import { urlFichePublique, urlQrFiche, messageWhatsAppPartageFiche } from "./fichesCommercialesUtils.js";

// ============================================================================
//  LOT 3 — Location de maison / immobilier : vrai système de baux/loyers, à côté
//  du flux existant (loyers en "commandes"), qui continue de fonctionner tel quel.
//  Tables : baux, loyers, paiements_loyer (voir sql/lot3-location-maison.sql).
//  Rendu plein écran, chargé en lazy depuis App.jsx (state showLocationMaison).
// ============================================================================

const COULEURS = {
  vert: "#1a7a3c", vertFonce: "#16231F", fond: "#FAFAF7", carte: "#FFFFFF",
  bordure: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", rougeFonce: "#B23A26",
  gris: "#6B7168", grisClair: "#8A9089",
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
// Toujours travailler en date-calendrier LOCALE (jamais toISOString() sur une date locale : ça
// bascule sur UTC et peut décaler le jour d'un cran selon le fuseau horaire du téléphone/serveur).
function ajourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function versISOLocal(annee, moisIndex0, jour) {
  return `${annee}-${String(moisIndex0 + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}
function premierDuMoisISO(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
}
function moisLabel(periodeISO) {
  const d = new Date(periodeISO + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function dernierJourDuMois(annee, moisIndex0) {
  return new Date(annee, moisIndex0 + 1, 0).getDate();
}
function dateEcheancePourPeriode(periodeISO, jourEcheance) {
  const d = new Date(periodeISO + "T00:00:00");
  const dernier = dernierJourDuMois(d.getFullYear(), d.getMonth());
  const jour = Math.min(Number(jourEcheance) || 5, dernier);
  return versISOLocal(d.getFullYear(), d.getMonth(), jour);
}
function statutLoyer(l) {
  const du = Number(l.montant_du || 0);
  const paye = Number(l.montant_paye || 0);
  const auj = ajourdhuiISO();
  if (paye >= du) return "paye";
  if (l.date_echeance < auj && paye < du) return "impaye";
  if (paye > 0) return "partiel";
  return "attendu";
}
const LIBELLE_STATUT = { paye: "✅ Payé", impaye: "🔴 Impayé", partiel: "🟠 Partiel", attendu: "⏳ Attendu" };
const COULEUR_STATUT = { paye: "#1F9D6E", impaye: COULEURS.rouge, partiel: COULEURS.ambre, attendu: COULEURS.gris };
const FOND_STATUT = { paye: "#EAF7F1", impaye: "#FBEAE6", partiel: "#FBF3E3", attendu: "#F1EFE8" };

const S = {
  section: { padding: "16px 16px 90px" },
  carte: { background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 14, padding: 16, marginBottom: 14 },
  titre: { fontWeight: 700, fontSize: 15, marginBottom: 8 },
  champ: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13.5, boxSizing: "border-box", background: "white", marginBottom: 8 },
  bouton: { background: COULEURS.vert, color: "white", border: "none", borderRadius: 9, padding: "11px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: COULEURS.vertFonce, border: `1px solid #DDD8CC`, borderRadius: 9, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  onglet: (actif) => ({ flex: 1, textAlign: "center", padding: "10px 4px", fontSize: 12, fontWeight: 700, borderRadius: 9, cursor: "pointer", background: actif ? COULEURS.vert : "transparent", color: actif ? "white" : COULEURS.gris }),
};

function peutEcrire(role) {
  return role === "owner" || role === "admin" || role === "comptable";
}

// ============================================================================
//  Chargement des données (baux, loyers, paiements, logements) pour l'espace.
// ============================================================================
function useDonneesLocation(workspace) {
  const [logements, setLogements] = useState([]);
  const [baux, setBaux] = useState([]);
  const [loyers, setLoyers] = useState([]);
  const [biensVente, setBiensVente] = useState([]);
  // "chargement" ne concerne QUE le tout premier chargement : un rechargement après une action
  // (encaisser, créer un bail…) ne doit jamais démonter l'écran en cours (et perdre une modale
  // ouverte, comme celle d'encaissement) — voir l'usage de "premierChargement" plus bas.
  const [premierChargement, setPremierChargement] = useState(true);

  const recharger = useCallback(async () => {
    const [{ data: log }, { data: bx }, { data: ly }] = await Promise.all([
      supabase.from("logements").select("*").eq("workspace_id", workspace.id).order("nom"),
      supabase.from("baux").select("*").eq("workspace_id", workspace.id).order("date_debut", { ascending: false }),
      supabase.from("loyers").select("*").eq("workspace_id", workspace.id).order("periode", { ascending: false }),
    ]);
    setLogements(log || []);
    setBaux(bx || []);
    setLoyers(ly || []);
    // Table séparée (LOT 5, sql/lot5-vente-immobiliere.sql) : peut ne pas encore exister tant que
    // la migration n'a pas été appliquée — dans ce cas l'onglet Ventes s'affiche juste vide au
    // lieu de casser tout l'écran Location.
    try {
      const { data: bv, error: bvErr } = await supabase.from("biens_vente").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
      setBiensVente(bvErr ? [] : (bv || []));
    } catch (_) { setBiensVente([]); }
    setPremierChargement(false);
  }, [workspace.id]);

  useEffect(() => { recharger(); }, [recharger]);

  return { logements, baux, loyers, biensVente, chargement: premierChargement, recharger, setLogements, setBaux, setLoyers, setBiensVente };
}

// Bail actif d'un logement pour la date du jour (ou null).
function bailActifPour(baux, logementId) {
  const auj = ajourdhuiISO();
  return (baux || []).find((b) => b.logement_id === logementId && b.statut === "actif" && b.date_debut <= auj && (!b.date_fin || b.date_fin >= auj)) || null;
}

// ============================================================================
//  Onglet 1 : Logements & occupation
// ============================================================================
function OngletLogements({ workspace, logements, baux, loyers, role, recharger, ouvrirBail }) {
  const [edition, setEdition] = useState(null); // id du logement en édition, ou "new"
  const [form, setForm] = useState({
    nom: "", adresse: "", loyer_mensuel: "", caution_suggeree: "", description: "",
    ville: "", quartier: "", superficie: "", nombre_pieces: "", nombre_chambres: "", nombre_salles_bain: "",
    video_url: "", photos: [],
  });
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  async function ajouterPhotosLogement(fichiers) {
    if (!fichiers || fichiers.length === 0) return;
    setEnvoiEnCours(true);
    try {
      const urls = [];
      for (const f of Array.from(fichiers)) {
        const compresse = await compresserImageBien(f);
        urls.push(await envoyerFichierBienVente(compresse, workspace.id, "logement"));
      }
      setForm((fo) => ({ ...fo, photos: [...fo.photos, ...urls] }));
    } catch (_) { /* affichage d'erreur non bloquant, comme ailleurs dans ce fichier */ }
    setEnvoiEnCours(false);
  }
  function retirerPhotoLogement(i) { setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) })); }

  const lignes = useMemo(() => logements.map((l) => {
    const bail = bailActifPour(baux, l.id);
    let prochaine = null;
    if (bail) {
      const loyersDuBail = loyers.filter((y) => y.bail_id === bail.id).sort((a, b) => a.periode.localeCompare(b.periode));
      prochaine = loyersDuBail.find((y) => statutLoyer(y) !== "paye") || loyersDuBail[loyersDuBail.length - 1] || null;
    }
    return { logement: l, occupe: !!bail, bail, prochaine };
  }), [logements, baux, loyers]);

  function commencerEdition(l) {
    setEdition(l.id);
    setForm({
      nom: l.nom || "", adresse: l.adresse || "", loyer_mensuel: String(l.loyer_mensuel || ""), caution_suggeree: String(l.caution_suggeree || ""), description: l.description || "",
      ville: l.ville || "", quartier: l.quartier || "", superficie: String(l.superficie || ""), nombre_pieces: String(l.nombre_pieces || ""),
      nombre_chambres: String(l.nombre_chambres || ""), nombre_salles_bain: String(l.nombre_salles_bain || ""),
      video_url: l.video_url || "", photos: Array.isArray(l.photos) ? l.photos : [],
    });
  }
  function commencerAjout() {
    setEdition("new");
    setForm({ nom: "", adresse: "", loyer_mensuel: "", caution_suggeree: "", description: "", ville: "", quartier: "", superficie: "", nombre_pieces: "", nombre_chambres: "", nombre_salles_bain: "", video_url: "", photos: [] });
  }

  async function enregistrer() {
    if (!form.nom.trim() || !form.loyer_mensuel) return;
    const nb = (v) => v === "" ? null : Number(v);
    const payload = {
      nom: form.nom.trim(), adresse: form.adresse.trim() || null, loyer_mensuel: Number(form.loyer_mensuel) || 0,
      caution_suggeree: Number(form.caution_suggeree) || 0, description: form.description.trim() || null,
      ville: form.ville.trim() || null, quartier: form.quartier.trim() || null,
      superficie: nb(form.superficie), nombre_pieces: nb(form.nombre_pieces), nombre_chambres: nb(form.nombre_chambres),
      nombre_salles_bain: nb(form.nombre_salles_bain), video_url: form.video_url.trim() || null, photos: form.photos,
    };
    if (edition === "new") {
      await supabase.from("logements").insert([{ ...payload, workspace_id: workspace.id, disponible: true }]);
    } else {
      await supabase.from("logements").update(payload).eq("id", edition);
    }
    setEdition(null);
    await recharger();
  }

  async function basculerDisponibilite(l) {
    await supabase.from("logements").update({ disponible: !l.disponible }).eq("id", l.id);
    await recharger();
  }

  return (
    <div>
      {peutEcrire(role) && (
        <div style={S.carte}>
          {edition === null ? (
            <button onClick={commencerAjout} style={{ ...S.bouton, width: "100%" }}>+ Ajouter un logement</button>
          ) : (
            <>
              <div style={S.titre}>{edition === "new" ? "Nouveau logement" : "Modifier ce logement"}</div>
              <input style={S.champ} placeholder="Nom (ex: Appartement 2, Villa Cocody)" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
              <input style={S.champ} placeholder="Adresse" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
              <input style={S.champ} type="number" placeholder={`Loyer mensuel (${devise(workspace.currency)})`} value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} />
              <input style={S.champ} type="number" placeholder={`Caution suggérée (${devise(workspace.currency)}, optionnel)`} value={form.caution_suggeree} onChange={(e) => setForm({ ...form, caution_suggeree: e.target.value })} />
              <textarea style={{ ...S.champ, minHeight: 55 }} placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.grisClair, margin: "4px 0" }}>Pour la fiche publique (optionnel)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={S.champ} placeholder="Ville" value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
                <input style={S.champ} placeholder="Quartier" value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={S.champ} type="number" placeholder="Superficie (m²)" value={form.superficie} onChange={(e) => setForm({ ...form, superficie: e.target.value })} />
                <input style={S.champ} type="number" placeholder="Pièces" value={form.nombre_pieces} onChange={(e) => setForm({ ...form, nombre_pieces: e.target.value })} />
                <input style={S.champ} type="number" placeholder="Chambres" value={form.nombre_chambres} onChange={(e) => setForm({ ...form, nombre_chambres: e.target.value })} />
                <input style={S.champ} type="number" placeholder="SDB" value={form.nombre_salles_bain} onChange={(e) => setForm({ ...form, nombre_salles_bain: e.target.value })} />
              </div>
              <input style={S.champ} placeholder="Lien vidéo (optionnel)" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {form.photos.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
                    <button onClick={() => retirerPhotoLogement(i)} style={{ position: "absolute", top: -6, right: -6, background: COULEURS.rougeFonce, color: "white", border: "none", borderRadius: 99, width: 16, height: 16, fontSize: 10, cursor: "pointer", lineHeight: "16px" }}>×</button>
                  </div>
                ))}
              </div>
              <label style={{ ...S.boutonClair, display: "block", textAlign: "center", cursor: "pointer", marginBottom: 8 }}>
                {envoiEnCours ? "Envoi…" : "📷 Ajouter des photos"}
                <input type="file" accept="image/*" multiple hidden onChange={(e) => ajouterPhotosLogement(e.target.files)} disabled={envoiEnCours} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={enregistrer} style={{ ...S.bouton, flex: 1 }}>Enregistrer</button>
                <button onClick={() => setEdition(null)} style={{ ...S.boutonClair, flex: 1 }}>Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      {lignes.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun logement pour l'instant.</div>}

      {lignes.map(({ logement: l, occupe, bail, prochaine }) => (
        <div key={l.id} style={S.carte}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{l.nom}</div>
              {l.adresse && <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>{l.adresse}</div>}
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: COULEURS.vert, marginTop: 6 }}>
                {nb(l.loyer_mensuel)} {devise(workspace.currency)} / mois
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: occupe ? "#FBEAE6" : "#EAF3DE", color: occupe ? COULEURS.rougeFonce : "#3B6D11" }}>
              {occupe ? "Occupé" : "Libre"}
            </span>
          </div>
          {occupe && bail ? (
            <div style={{ fontSize: 12.5, color: COULEURS.vertFonce, marginBottom: 6 }}>
              Locataire : <strong>{bail.locataire_nom}</strong>
              {prochaine && <> · Prochaine échéance : {new Date(prochaine.date_echeance).toLocaleDateString("fr-FR")} ({LIBELLE_STATUT[statutLoyer(prochaine)]})</>}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: COULEURS.grisClair, marginBottom: 6 }}>Aucun locataire actuellement.</div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {peutEcrire(role) && <button onClick={() => commencerEdition(l)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>✏️ Modifier</button>}
            {peutEcrire(role) && !occupe && <button onClick={() => ouvrirBail(l)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>📄 Créer un bail</button>}
            {peutEcrire(role) && (
              <button onClick={() => basculerDisponibilite(l)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>
                {l.disponible ? "Marquer loué (secours)" : "Marquer disponible (secours)"}
              </button>
            )}
          </div>
          {!occupe && (
            <PanneauPublierFiche workspace={workspace} typeEntite="logement" entite={l} table="logements" onMaj={recharger} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
//  Onglet 2 : Baux / locataires
// ============================================================================
function BailForm({ workspace, logements, baux, logementPreselectionne, onFermer, onEnregistre }) {
  const [form, setForm] = useState({
    logement_id: logementPreselectionne?.id || "",
    locataire_nom: "", locataire_tel: "", locataire_email: "", locataire_piece_identite: "",
    date_debut: ajourdhuiISO(), date_fin: "",
    loyer_mensuel: logementPreselectionne ? String(logementPreselectionne.loyer_mensuel || "") : "",
    jour_echeance: "5", caution: logementPreselectionne ? String(logementPreselectionne.caution_suggeree || "") : "", caution_versee: false, note: "",
  });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  function choisirLogement(id) {
    const l = logements.find((x) => x.id === id);
    setForm((f) => ({ ...f, logement_id: id, loyer_mensuel: l ? String(l.loyer_mensuel || "") : f.loyer_mensuel, caution: l ? String(l.caution_suggeree || "") : f.caution }));
  }

  async function enregistrer() {
    setErreur("");
    if (!form.logement_id || !form.locataire_nom.trim() || !form.loyer_mensuel || !form.date_debut) {
      setErreur("Logement, nom du locataire, loyer et date de début sont obligatoires.");
      return;
    }
    const jour = Math.min(28, Math.max(1, Number(form.jour_echeance) || 5));
    setEnCours(true);
    const { error } = await supabase.from("baux").insert([{
      workspace_id: workspace.id,
      logement_id: form.logement_id,
      locataire_nom: form.locataire_nom.trim(),
      locataire_tel: form.locataire_tel.trim() || null,
      locataire_email: form.locataire_email.trim() || null,
      locataire_piece_identite: form.locataire_piece_identite.trim() || null,
      date_debut: form.date_debut,
      date_fin: form.date_fin || null,
      loyer_mensuel: Number(form.loyer_mensuel) || 0,
      devise: workspace.currency || null,
      jour_echeance: jour,
      caution: Number(form.caution) || 0,
      caution_versee: !!form.caution_versee,
      note: form.note.trim() || null,
      statut: "actif",
    }]);
    setEnCours(false);
    if (error) {
      // Le trigger SQL renvoie un message clair en cas de chevauchement de baux actifs.
      setErreur(error.message.includes("chevauche") || error.message.includes("existe déjà") ? error.message : "Impossible de créer ce bail : " + error.message);
      return;
    }
    onEnregistre();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Nouveau bail</div>
        <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Logement</label>
        <select style={S.champ} value={form.logement_id} onChange={(e) => choisirLogement(e.target.value)}>
          <option value="">Choisir…</option>
          {logements.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
        </select>
        <input style={S.champ} placeholder="Nom du locataire" value={form.locataire_nom} onChange={(e) => setForm({ ...form, locataire_nom: e.target.value })} />
        <input style={S.champ} placeholder="Téléphone (WhatsApp)" value={form.locataire_tel} onChange={(e) => setForm({ ...form, locataire_tel: e.target.value })} />
        <input style={S.champ} placeholder="Email (optionnel)" value={form.locataire_email} onChange={(e) => setForm({ ...form, locataire_email: e.target.value })} />
        <input style={S.champ} placeholder="N° pièce d'identité (optionnel)" value={form.locataire_piece_identite} onChange={(e) => setForm({ ...form, locataire_piece_identite: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Début du bail</label>
            <input style={S.champ} type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Fin (optionnel)</label>
            <input style={S.champ} type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={S.champ} type="number" placeholder={`Loyer mensuel (${devise(workspace.currency)})`} value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} />
          <input style={{ ...S.champ, maxWidth: 110 }} type="number" min="1" max="28" placeholder="Jour échéance" value={form.jour_echeance} onChange={(e) => setForm({ ...form, jour_echeance: e.target.value })} />
        </div>
        <input style={S.champ} type="number" placeholder={`Caution (${devise(workspace.currency)})`} value={form.caution} onChange={(e) => setForm({ ...form, caution: e.target.value })} />
        <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <input type="checkbox" checked={form.caution_versee} onChange={(e) => setForm({ ...form, caution_versee: e.target.checked })} /> Caution déjà versée
        </label>
        <textarea style={{ ...S.champ, minHeight: 50 }} placeholder="Note (optionnel)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        {erreur && <div style={{ background: "#FBEAE6", color: COULEURS.rougeFonce, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginBottom: 8 }}>{erreur}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={enCours} onClick={enregistrer} style={{ ...S.bouton, flex: 1, opacity: enCours ? 0.6 : 1 }}>{enCours ? "…" : "Créer le bail"}</button>
          <button onClick={onFermer} style={{ ...S.boutonClair, flex: 1 }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function FinBailForm({ workspace, bail, onFermer, onTermine }) {
  const [caution_rendue, setCautionRendue] = useState(true);
  const [caution_retenue, setCautionRetenue] = useState("0");
  const [motif_retenue, setMotifRetenue] = useState("");
  const [dateFin, setDateFin] = useState(ajourdhuiISO());
  const [enCours, setEnCours] = useState(false);

  async function terminer() {
    setEnCours(true);
    const retenue = Number(caution_retenue) || 0;
    await supabase.from("baux").update({
      statut: "termine",
      date_fin: dateFin,
      caution_rendue: !!caution_rendue,
      caution_retenue: retenue,
      motif_retenue: retenue > 0 ? (motif_retenue.trim() || null) : null,
    }).eq("id", bail.id);
    setEnCours(false);
    onTermine();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Mettre fin au bail</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 12 }}>{bail.locataire_nom}</div>
        <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Date de fin</label>
        <input style={S.champ} type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        {Number(bail.caution) > 0 && (
          <>
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🔒 Caution : {nb(bail.caution)} {devise(bail.devise || workspace.currency)}</div>
              <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <input type="checkbox" checked={caution_rendue} onChange={(e) => setCautionRendue(e.target.checked)} /> Rendre la caution au locataire
              </label>
              <label style={{ fontSize: 11.5, color: COULEURS.grisClair }}>Montant retenu (dégâts, impayés…), optionnel</label>
              <input style={S.champ} type="number" value={caution_retenue} onChange={(e) => setCautionRetenue(e.target.value)} />
              {Number(caution_retenue) > 0 && (
                <input style={S.champ} placeholder="Motif de la retenue" value={motif_retenue} onChange={(e) => setMotifRetenue(e.target.value)} />
              )}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={enCours} onClick={terminer} style={{ ...S.bouton, flex: 1, background: COULEURS.rouge }}>{enCours ? "…" : "Terminer le bail"}</button>
          <button onClick={onFermer} style={{ ...S.boutonClair, flex: 1 }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

function OngletBaux({ workspace, logements, baux, role, recharger, preselection, consommerPreselection, genererContratPDF }) {
  const [showForm, setShowForm] = useState(false);
  const [bailAFinir, setBailAFinir] = useState(null);

  useEffect(() => {
    if (preselection) { setShowForm(true); }
  }, [preselection]);

  function nomLogement(id) {
    return (logements.find((l) => l.id === id) || {}).nom || "Logement supprimé";
  }

  const tries = useMemo(() => [...baux].sort((a, b) => (a.statut === b.statut ? 0 : a.statut === "actif" ? -1 : 1)), [baux]);

  return (
    <div>
      {peutEcrire(role) && (
        <div style={S.carte}>
          <button onClick={() => setShowForm(true)} style={{ ...S.bouton, width: "100%" }}>+ Nouveau bail</button>
        </div>
      )}
      {tries.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun bail pour l'instant.</div>}
      {tries.map((b) => (
        <div key={b.id} style={S.carte}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.locataire_nom}</div>
              <div style={{ fontSize: 12, color: COULEURS.grisClair }}>{nomLogement(b.logement_id)}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: b.statut === "actif" ? "#EAF3DE" : "#F1EFE8", color: b.statut === "actif" ? "#3B6D11" : COULEURS.gris }}>
              {b.statut === "actif" ? "Actif" : "Terminé"}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: COULEURS.vertFonce, marginBottom: 4 }}>
            {nb(b.loyer_mensuel)} {devise(b.devise || workspace.currency)}/mois · échéance le {b.jour_echeance} · du {new Date(b.date_debut).toLocaleDateString("fr-FR")} {b.date_fin ? `au ${new Date(b.date_fin).toLocaleDateString("fr-FR")}` : "(sans date de fin)"}
          </div>
          {Number(b.caution) > 0 && (
            <div style={{ fontSize: 12, color: COULEURS.gris, marginBottom: 6 }}>
              Caution {nb(b.caution)} {devise(b.devise || workspace.currency)} {b.caution_versee ? "— versée" : "— non versée"}
              {b.statut === "termine" && (b.caution_rendue ? ` — rendue${Number(b.caution_retenue) > 0 ? ` (${nb(b.caution_retenue)} retenus : ${b.motif_retenue || "sans motif précisé"})` : ""}` : " — non rendue")}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => genererContratPDF(b)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>📄 Contrat PDF</button>
            {peutEcrire(role) && b.statut === "actif" && (
              <button onClick={() => setBailAFinir(b)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12, color: COULEURS.rougeFonce }}>Mettre fin au bail</button>
            )}
          </div>
        </div>
      ))}
      {showForm && (
        <BailForm
          workspace={workspace}
          logements={logements}
          baux={baux}
          logementPreselectionne={preselection}
          onFermer={() => { setShowForm(false); consommerPreselection(); }}
          onEnregistre={async () => { setShowForm(false); consommerPreselection(); await recharger(); }}
        />
      )}
      {bailAFinir && (
        <FinBailForm
          workspace={workspace}
          bail={bailAFinir}
          onFermer={() => setBailAFinir(null)}
          onTermine={async () => { setBailAFinir(null); await recharger(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
//  Onglet 3 : Loyers (vue du mois + filtres + encaissement)
// ============================================================================
function ModalPaiements({ workspace, loyer, bail, onFermer, onMaj }) {
  const [paiements, setPaiements] = useState([]);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("especes");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const reste = Math.max(0, Number(loyer.montant_du) - Number(loyer.montant_paye || 0));

  const charger = useCallback(async () => {
    const { data } = await supabase.from("paiements_loyer").select("*").eq("loyer_id", loyer.id).order("date_paiement", { ascending: false });
    setPaiements(data || []);
  }, [loyer.id]);
  useEffect(() => { charger(); }, [charger]);

  async function encaisser() {
    setErreur("");
    const m = Number(montant);
    if (!m || m <= 0) { setErreur("Indique un montant valide."); return; }
    if (m > reste + 0.01) { setErreur(`Ce montant dépasse le reste à payer (${nb(reste)} ${devise(workspace.currency)}).`); return; }
    setEnCours(true);
    const { error } = await supabase.from("paiements_loyer").insert([{ loyer_id: loyer.id, workspace_id: workspace.id, montant: m, mode, date_paiement: ajourdhuiISO() }]);
    setEnCours(false);
    if (error) { setErreur(error.message.includes("dépasse") ? error.message : "Erreur : " + error.message); return; }
    setMontant("");
    await charger();
    await onMaj();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{bail?.locataire_nom || "Locataire"}</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 10 }}>{moisLabel(loyer.periode)} · dû {nb(loyer.montant_du)} {devise(workspace.currency)}, déjà payé {nb(loyer.montant_paye)} {devise(workspace.currency)}</div>
        {reste > 0 ? (
          <div style={{ background: "#F4F1E8", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Encaisser (reste {nb(reste)} {devise(workspace.currency)})</div>
            <input style={S.champ} type="number" placeholder="Montant reçu" value={montant} onChange={(e) => setMontant(e.target.value)} />
            <select style={S.champ} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="especes">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement</option>
              <option value="autre">Autre</option>
            </select>
            <button onClick={() => setMontant(String(reste))} style={{ ...S.boutonClair, width: "100%", marginBottom: 8, padding: "8px 0", fontSize: 12 }}>Payer le solde ({nb(reste)})</button>
            {erreur && <div style={{ color: COULEURS.rougeFonce, fontSize: 12, marginBottom: 8 }}>{erreur}</div>}
            <button disabled={enCours} onClick={encaisser} style={{ ...S.bouton, width: "100%" }}>{enCours ? "…" : "✅ Encaisser"}</button>
          </div>
        ) : (
          <div style={{ background: "#EAF7F1", color: "#1F9D6E", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>Ce loyer est intégralement payé.</div>
        )}
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Historique des paiements</div>
        {paiements.length === 0 && <div style={{ fontSize: 12.5, color: COULEURS.grisClair }}>Aucun paiement enregistré.</div>}
        {paiements.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #F1EFE8" }}>
            <span>{new Date(p.date_paiement).toLocaleDateString("fr-FR")} · {p.mode}</span>
            <span style={{ fontWeight: 700 }}>{nb(p.montant)} {devise(workspace.currency)}</span>
          </div>
        ))}
        <button onClick={onFermer} style={{ ...S.boutonClair, width: "100%", marginTop: 12 }}>Fermer</button>
      </div>
    </div>
  );
}

function OngletLoyers({ workspace, baux, loyers, logements, role, recharger, genererQuittancePDF, relancerWhatsApp }) {
  const [filtre, setFiltre] = useState("tous"); // tous | a_encaisser | en_retard | payes
  const [loyerOuvert, setLoyerOuvert] = useState(null);

  function bailDe(l) { return baux.find((b) => b.id === l.bail_id); }
  function logementDe(bail) { return bail ? logements.find((lg) => lg.id === bail.logement_id) : null; }

  const loyersFiltres = useMemo(() => {
    return loyers.filter((l) => {
      const st = statutLoyer(l);
      if (filtre === "a_encaisser") return st === "attendu" || st === "partiel";
      if (filtre === "en_retard") return st === "impaye";
      if (filtre === "payes") return st === "paye";
      return true;
    });
  }, [loyers, filtre]);

  const totaux = useMemo(() => {
    const auj = new Date();
    const moisCourant = premierDuMoisISO(auj);
    const duMois = loyers.filter((l) => l.periode === moisCourant);
    const attendu = duMois.reduce((s, l) => s + Number(l.montant_du || 0), 0);
    const encaisse = duMois.reduce((s, l) => s + Number(l.montant_paye || 0), 0);
    const impayeCumule = loyers.filter((l) => statutLoyer(l) === "impaye").reduce((s, l) => s + (Number(l.montant_du) - Number(l.montant_paye || 0)), 0);
    return { attendu, encaisse, impayeCumule };
  }, [loyers]);

  return (
    <div>
      <div style={{ ...S.carte, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 100px" }}>
          <div style={{ fontSize: 11, color: COULEURS.grisClair }}>Attendu ce mois</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{nb(totaux.attendu)} {devise(workspace.currency)}</div>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <div style={{ fontSize: 11, color: COULEURS.grisClair }}>Encaissé ce mois</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.vert }}>{nb(totaux.encaisse)} {devise(workspace.currency)}</div>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <div style={{ fontSize: 11, color: COULEURS.grisClair }}>Impayés cumulés</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.rouge }}>{nb(totaux.impayeCumule)} {devise(workspace.currency)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["tous", "Tous"], ["a_encaisser", "À encaisser"], ["en_retard", "En retard"], ["payes", "Payés"]].map(([k, l]) => (
          <div key={k} onClick={() => setFiltre(k)} style={S.onglet(filtre === k)}>{l}</div>
        ))}
      </div>

      {loyersFiltres.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun loyer dans ce filtre.</div>}

      {loyersFiltres.map((l) => {
        const bail = bailDe(l);
        const logement = logementDe(bail);
        const st = statutLoyer(l);
        const reste = Math.max(0, Number(l.montant_du) - Number(l.montant_paye || 0));
        return (
          <div key={l.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{bail?.locataire_nom || "Locataire"} — {logement?.nom || ""}</div>
                <div style={{ fontSize: 12, color: COULEURS.grisClair }}>{moisLabel(l.periode)} · échéance {new Date(l.date_echeance).toLocaleDateString("fr-FR")}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: FOND_STATUT[st], color: COULEUR_STATUT[st] }}>{LIBELLE_STATUT[st]}</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Dû {nb(l.montant_du)} · Payé {nb(l.montant_paye)} {reste > 0 && <span style={{ color: COULEURS.rougeFonce, fontWeight: 700 }}> · Reste {nb(reste)}</span>} {devise(workspace.currency)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {peutEcrire(role) && reste > 0 && <button onClick={() => setLoyerOuvert(l)} style={{ ...S.bouton, padding: "7px 12px", fontSize: 12 }}>💰 Encaisser</button>}
              {reste === 0 && <button onClick={() => setLoyerOuvert(l)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>Historique</button>}
              {(st === "paye" || st === "partiel") && <button onClick={() => genererQuittancePDF(l, bail, logement)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>🧾 Quittance PDF</button>}
              {st === "impaye" && bail?.locataire_tel && <button onClick={() => relancerWhatsApp(l, bail)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12, background: "#EAF3DE", color: "#3B6D11" }}>💬 Relancer WhatsApp</button>}
            </div>
          </div>
        );
      })}

      {loyerOuvert && (
        <ModalPaiements
          workspace={workspace}
          loyer={loyerOuvert}
          bail={bailDe(loyerOuvert)}
          onFermer={() => setLoyerOuvert(null)}
          onMaj={recharger}
        />
      )}
    </div>
  );
}

// ============================================================================
//  Tableau de bord immobilier (haut de la vue)
// ============================================================================
function TableauDeBord({ workspace, logements, baux, loyers }) {
  const stats = useMemo(() => {
    const occupes = logements.filter((l) => bailActifPour(baux, l.id)).length;
    const tauxOccupation = logements.length > 0 ? Math.round((occupes / logements.length) * 100) : 0;

    const moisCourant = premierDuMoisISO(new Date());
    const encaisseMois = loyers.filter((l) => l.periode === moisCourant).reduce((s, l) => s + Number(l.montant_paye || 0), 0);
    const impayesCumules = loyers.filter((l) => statutLoyer(l) === "impaye").reduce((s, l) => s + (Number(l.montant_du) - Number(l.montant_paye || 0)), 0);

    // Revenus par logement, 12 derniers mois (seulement si des paiements existent).
    const ilYA12Mois = new Date(); ilYA12Mois.setMonth(ilYA12Mois.getMonth() - 11); ilYA12Mois.setDate(1);
    const seuilISO = ilYA12Mois.toISOString().slice(0, 10);
    const parLogement = {};
    loyers.filter((l) => l.periode >= seuilISO && Number(l.montant_paye) > 0).forEach((l) => {
      const bail = baux.find((b) => b.id === l.bail_id);
      if (!bail) return;
      const logement = logements.find((lg) => lg.id === bail.logement_id);
      const nom = logement?.nom || "Logement supprimé";
      parLogement[nom] = (parLogement[nom] || 0) + Number(l.montant_paye || 0);
    });
    const revenusParLogement = Object.entries(parLogement).sort((a, b) => b[1] - a[1]);

    return { occupes, tauxOccupation, encaisseMois, impayesCumules, revenusParLogement };
  }, [logements, baux, loyers]);

  return (
    <div style={{ ...S.carte, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🏠 Tableau de bord immobilier</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: revenusParLogement_length(stats) ? 12 : 0 }}>
        <Tuile label="Taux d'occupation" valeur={`${stats.tauxOccupation}%`} sous={`${stats.occupes}/${logements.length} logement${logements.length > 1 ? "s" : ""}`} />
        <Tuile label="Encaissé ce mois" valeur={`${nb(stats.encaisseMois)} ${devise(workspace.currency)}`} couleur={COULEURS.vert} />
        <Tuile label="Impayés cumulés" valeur={`${nb(stats.impayesCumules)} ${devise(workspace.currency)}`} couleur={stats.impayesCumules > 0 ? COULEURS.rouge : COULEURS.gris} />
      </div>
      {stats.revenusParLogement.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 8, marginBottom: 6 }}>Revenus par logement (12 derniers mois)</div>
          {stats.revenusParLogement.map(([nom, total]) => (
            <div key={nom} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
              <span>{nom}</span>
              <span style={{ fontWeight: 700 }}>{nb(total)} {devise(workspace.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function revenusParLogement_length(stats) { return stats.revenusParLogement.length; }

function Tuile({ label, valeur, sous, couleur }) {
  return (
    <div style={{ flex: "1 1 110px", background: "#F9F8F3", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, color: COULEURS.grisClair, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: couleur || COULEURS.vertFonce }}>{valeur}</div>
      {sous && <div style={{ fontSize: 10.5, color: COULEURS.grisClair }}>{sous}</div>}
    </div>
  );
}

// ============================================================================
//  Onglet 4 : Ventes immobilières (LOT 5, sql/lot5-vente-immobiliere.sql) — biens à
//  vendre (maison, duplex, terrain…), à côté du système de location ci-dessus, dans
//  le même espace de travail "immobilier". 100% additif : aucune table de location
//  n'est touchée, tables séparées (biens_vente, paiements_vente).
// ============================================================================

const TYPES_BIEN_VENTE = [
  ["maison", "Maison"], ["duplex", "Duplex"], ["appartement", "Appartement"],
  ["villa", "Villa"], ["terrain", "Terrain"], ["autre", "Autre"],
];
const LIBELLE_STATUT_VENTE = { disponible: "🟢 Disponible", reserve: "🟠 Réservé", vendu: "✅ Vendu" };
const FOND_STATUT_VENTE = { disponible: "#EAF3DE", reserve: "#FBF3E3", vendu: "#EAF7F1" };
const COULEUR_STATUT_VENTE = { disponible: "#3B6D11", reserve: COULEURS.ambre, vendu: "#1F9D6E" };

// Caractéristiques à cocher (section 4 du cahier des charges) — affichées en grille de puces.
const CARACS_BIEN_VENTE = [
  ["salon", "Salon"], ["salle_a_manger", "Salle à manger"], ["cuisine_equipee", "Cuisine équipée"],
  ["garage", "Garage"], ["parking", "Parking"], ["balcon", "Balcon"], ["terrasse", "Terrasse"],
  ["jardin", "Jardin"], ["piscine", "Piscine"], ["dependance", "Dépendance"], ["cloture", "Clôture"],
  ["portail", "Portail"], ["securite", "Sécurité"],
];

// Compression d'image avant envoi — copie volontairement autonome (ce fichier ne dépend pas des
// utilitaires d'App.jsx), même logique que celle déjà utilisée ailleurs dans l'application.
function compresserImageBien(file, maxWidth = 1280, quality = 0.82) {
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
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        }, "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Si la fiche est restée ouverte longtemps avant l'envoi (surtout pour une vidéo, plus longue à
// envoyer), la session de connexion peut avoir expiré entre-temps. On la rafraîchit juste avant
// pour éviter l'erreur technique "'exp' claim timestamp check failed".
async function assurerSessionFraicheBienVente() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 120000) {
      await supabase.auth.refreshSession();
    }
  } catch (_) { /* si le rafraîchissement échoue, on tente quand même l'envoi normalement */ }
}

async function envoyerFichierBienVente(file, workspaceId, prefixe) {
  await assurerSessionFraicheBienVente();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const chemin = `${workspaceId}/vente-${prefixe}-${Date.now()}-${Math.round(Math.random() * 9999)}.${ext}`;
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

const ETAPES_BIEN_VENTE = [
  ["infos", "Informations"], ["localisation", "Localisation"], ["caracteristiques", "Caractéristiques"],
  ["medias", "Photos & médias"], ["prix", "Prix & disponibilité"],
];

function FormBienVente({ workspace, bien, onFermer, onEnregistre }) {
  const [etape, setEtape] = useState(0);
  const [form, setForm] = useState({
    nom: bien?.nom || "", type_bien: bien?.type_bien || "maison", titre_annonce: bien?.titre_annonce || "",
    description: bien?.description || "",
    adresse: bien?.adresse || "", pays: bien?.pays || "", ville: bien?.ville || "", commune: bien?.commune || "",
    quartier: bien?.quartier || "", adresse_precise: bien?.adresse_precise || "", points_de_repere: bien?.points_de_repere || "",
    adresse_publique_visible: bien?.adresse_publique_visible || false,
    superficie: bien ? String(bien.superficie || "") : "", superficie_terrain: bien ? String(bien.superficie_terrain || "") : "",
    nombre_pieces: bien ? String(bien.nombre_pieces || "") : "", nombre_chambres: bien ? String(bien.nombre_chambres || "") : "",
    nombre_salles_bain: bien ? String(bien.nombre_salles_bain || "") : "", nombre_toilettes: bien ? String(bien.nombre_toilettes || "") : "",
    nombre_etages: bien ? String(bien.nombre_etages || "") : "",
    salon: bien?.salon || false, salle_a_manger: bien?.salle_a_manger || false, cuisine_equipee: bien?.cuisine_equipee || false,
    garage: bien?.garage || false, parking: bien?.parking || false, balcon: bien?.balcon || false, terrasse: bien?.terrasse || false,
    jardin: bien?.jardin || false, piscine: bien?.piscine || false, dependance: bien?.dependance || false, cloture: bien?.cloture || false,
    portail: bien?.portail || false, securite: bien?.securite || false,
    caracteristiques_personnalisees: Array.isArray(bien?.caracteristiques_personnalisees) ? bien.caracteristiques_personnalisees : [],
    photos: Array.isArray(bien?.photos) ? bien.photos : [], video_url: bien?.video_url || "", plan_url: bien?.plan_url || "",
    brochure_url: bien?.brochure_url || "", documents: Array.isArray(bien?.documents) ? bien.documents : [],
    prix_vente: bien ? String(bien.prix_vente || "") : "", prix_negociable: bien?.prix_negociable || false,
    disponibilite: bien?.disponibilite || "",
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
        const compresse = await compresserImageBien(f);
        urls.push(await envoyerFichierBienVente(compresse, workspace.id, "photo"));
      }
      setForm((fo) => ({ ...fo, photos: [...fo.photos, ...urls] }));
    } catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }
  function retirerPhoto(i) { setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) })); }
  function photoPrincipaleEnPremier(i) {
    setForm((f) => { const p = [...f.photos]; const [choisie] = p.splice(i, 1); return { ...f, photos: [choisie, ...p] }; });
  }

  async function envoyerFichierUnique(fichier, champ) {
    if (!fichier) return;
    setEnvoiEnCours(true); setErreur("");
    try {
      const source = champ === "plan_url" ? await compresserImageBien(fichier) : fichier;
      const url = await envoyerFichierBienVente(source, workspace.id, champ.replace("_url", ""));
      maj({ [champ]: url });
    } catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }

  async function ajouterDocument(fichier) {
    if (!fichier) return;
    setEnvoiEnCours(true); setErreur("");
    try {
      const url = await envoyerFichierBienVente(fichier, workspace.id, "doc");
      setForm((f) => ({ ...f, documents: [...f.documents, { nom: fichier.name, url }] }));
    } catch (e) { setErreur("Envoi impossible : " + e.message); }
    setEnvoiEnCours(false);
  }
  function retirerDocument(i) { setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) })); }

  function ajouterCaracPerso() {
    setForm((f) => ({ ...f, caracteristiques_personnalisees: [...f.caracteristiques_personnalisees, { libelle: "", valeur: "" }] }));
  }
  function majCaracPerso(i, champ, valeur) {
    setForm((f) => ({ ...f, caracteristiques_personnalisees: f.caracteristiques_personnalisees.map((c, idx) => idx === i ? { ...c, [champ]: valeur } : c) }));
  }
  function retirerCaracPerso(i) { setForm((f) => ({ ...f, caracteristiques_personnalisees: f.caracteristiques_personnalisees.filter((_, idx) => idx !== i) })); }

  const nombre = (v) => v === "" ? null : Number(v);

  async function enregistrer() {
    setErreur("");
    if (!form.nom.trim() || !form.prix_vente) {
      setErreur("Le nom du bien et le prix de vente sont obligatoires.");
      setEtape(form.nom.trim() ? 4 : 0);
      return;
    }
    const payload = {
      nom: form.nom.trim(), type_bien: form.type_bien, titre_annonce: form.titre_annonce.trim() || null,
      description: form.description.trim() || null,
      adresse: form.adresse.trim() || null, pays: form.pays.trim() || null, ville: form.ville.trim() || null,
      commune: form.commune.trim() || null, quartier: form.quartier.trim() || null,
      adresse_precise: form.adresse_precise.trim() || null, points_de_repere: form.points_de_repere.trim() || null,
      adresse_publique_visible: !!form.adresse_publique_visible,
      superficie: nombre(form.superficie), superficie_terrain: nombre(form.superficie_terrain),
      nombre_pieces: nombre(form.nombre_pieces), nombre_chambres: nombre(form.nombre_chambres),
      nombre_salles_bain: nombre(form.nombre_salles_bain), nombre_toilettes: nombre(form.nombre_toilettes),
      nombre_etages: nombre(form.nombre_etages),
      salon: form.salon, salle_a_manger: form.salle_a_manger, cuisine_equipee: form.cuisine_equipee,
      garage: form.garage, parking: form.parking, balcon: form.balcon, terrasse: form.terrasse, jardin: form.jardin,
      piscine: form.piscine, dependance: form.dependance, cloture: form.cloture, portail: form.portail, securite: form.securite,
      caracteristiques_personnalisees: form.caracteristiques_personnalisees.filter((c) => c.libelle.trim()),
      photos: form.photos, photo_url: form.photos[0] || null, video_url: form.video_url.trim() || null,
      plan_url: form.plan_url || null, brochure_url: form.brochure_url || null, documents: form.documents,
      prix_vente: Number(form.prix_vente) || 0, prix_negociable: !!form.prix_negociable, disponibilite: form.disponibilite.trim() || null,
    };
    setEnCours(true);
    const { error } = bien
      ? await supabase.from("biens_vente").update(payload).eq("id", bien.id)
      : await supabase.from("biens_vente").insert([{ ...payload, workspace_id: workspace.id, statut: "disponible" }]);
    setEnCours(false);
    if (error) { setErreur("Erreur : " + error.message); return; }
    onEnregistre();
  }

  const dernierIndex = ETAPES_BIEN_VENTE.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{bien ? "Modifier ce bien" : "Nouveau bien à vendre"}</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
          {ETAPES_BIEN_VENTE.map(([k, l], i) => (
            <div key={k} onClick={() => setEtape(i)} style={{
              fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 99, cursor: "pointer",
              background: i === etape ? COULEURS.vertFonce : "#F1EFE8", color: i === etape ? "white" : COULEURS.grisClair,
            }}>{i + 1}. {l}</div>
          ))}
        </div>

        {etape === 0 && (
          <>
            <input style={S.champ} placeholder="Nom interne (ex: Villa Cocody 4 pièces)" value={form.nom} onChange={(e) => maj({ nom: e.target.value })} />
            <select style={S.champ} value={form.type_bien} onChange={(e) => maj({ type_bien: e.target.value })}>
              {TYPES_BIEN_VENTE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input style={S.champ} placeholder="Titre de l'annonce (ex: Villa moderne 5 pièces — Riviera)" value={form.titre_annonce} onChange={(e) => maj({ titre_annonce: e.target.value })} />
            <textarea style={{ ...S.champ, minHeight: 70 }} placeholder="Description (optionnel)" value={form.description} onChange={(e) => maj({ description: e.target.value })} />
          </>
        )}

        {etape === 1 && (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 4 }}>Localisation publique (visible sur la future fiche)</div>
            <input style={S.champ} placeholder="Adresse / zone (résumé affiché aujourd'hui)" value={form.adresse} onChange={(e) => maj({ adresse: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Pays" value={form.pays} onChange={(e) => maj({ pays: e.target.value })} />
              <input style={S.champ} placeholder="Ville" value={form.ville} onChange={(e) => maj({ ville: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} placeholder="Commune" value={form.commune} onChange={(e) => maj({ commune: e.target.value })} />
              <input style={S.champ} placeholder="Quartier" value={form.quartier} onChange={(e) => maj({ quartier: e.target.value })} />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, margin: "10px 0 4px" }}>Localisation privée (équipe seulement, jamais publiée sans ton accord)</div>
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
              <input style={S.champ} type="number" placeholder="Superficie habitable (m²)" value={form.superficie} onChange={(e) => maj({ superficie: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Superficie du terrain (m²)" value={form.superficie_terrain} onChange={(e) => maj({ superficie_terrain: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} type="number" placeholder="Nombre de pièces" value={form.nombre_pieces} onChange={(e) => maj({ nombre_pieces: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Nombre de chambres" value={form.nombre_chambres} onChange={(e) => maj({ nombre_chambres: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.champ} type="number" placeholder="Salles de bain" value={form.nombre_salles_bain} onChange={(e) => maj({ nombre_salles_bain: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Toilettes" value={form.nombre_toilettes} onChange={(e) => maj({ nombre_toilettes: e.target.value })} />
              <input style={S.champ} type="number" placeholder="Étages" value={form.nombre_etages} onChange={(e) => maj({ nombre_etages: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
              {CARACS_BIEN_VENTE.map(([cle, label]) => (
                <div key={cle} onClick={() => bascule(cle)} style={{
                  fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 99, cursor: "pointer",
                  background: form[cle] ? "#EAF3DE" : "#F5F5F0", color: form[cle] ? "#3B6D11" : COULEURS.gris,
                  border: `1px solid ${form[cle] ? COULEURS.vert : "#E5E2D8"}`,
                }}>{form[cle] ? "✓ " : ""}{label}</div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, margin: "10px 0 4px" }}>Autres caractéristiques (optionnel)</div>
            {form.caracteristiques_personnalisees.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input style={{ ...S.champ, marginBottom: 0, flex: 1 }} placeholder="Ex: Titre foncier" value={c.libelle} onChange={(e) => majCaracPerso(i, "libelle", e.target.value)} />
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
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <label style={{ ...S.boutonClair, flex: 1, textAlign: "center", cursor: "pointer", fontSize: 12 }}>
                {form.plan_url ? "✓ Plan ajouté" : "🗺️ Ajouter un plan"}
                <input type="file" accept="image/*,.pdf" hidden onChange={(e) => envoyerFichierUnique(e.target.files[0], "plan_url")} disabled={envoiEnCours} />
              </label>
              <label style={{ ...S.boutonClair, flex: 1, textAlign: "center", cursor: "pointer", fontSize: 12 }}>
                {form.brochure_url ? "✓ Brochure ajoutée" : "📄 Ajouter une brochure"}
                <input type="file" accept=".pdf,image/*" hidden onChange={(e) => envoyerFichierUnique(e.target.files[0], "brochure_url")} disabled={envoiEnCours} />
              </label>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 6 }}>Autres documents</div>
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
            <input style={S.champ} placeholder="Disponibilité (ex: Immédiate, Sous 30 jours...)" value={form.disponibilite} onChange={(e) => maj({ disponibilite: e.target.value })} />
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

function FormReserverVendre({ workspace, bien, statutCible, onFermer, onEnregistre }) {
  const [form, setForm] = useState({ acheteur_nom: bien.acheteur_nom || "", acheteur_tel: bien.acheteur_tel || "", acheteur_email: bien.acheteur_email || "", date_vente: ajourdhuiISO() });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const estVente = statutCible === "vendu";

  async function enregistrer() {
    setErreur("");
    if (!form.acheteur_nom.trim()) { setErreur("Le nom de l'acheteur est obligatoire."); return; }
    setEnCours(true);
    const { error } = await supabase.from("biens_vente").update({
      statut: statutCible,
      acheteur_nom: form.acheteur_nom.trim(),
      acheteur_tel: form.acheteur_tel.trim() || null,
      acheteur_email: form.acheteur_email.trim() || null,
      date_vente: estVente ? form.date_vente : null,
    }).eq("id", bien.id);
    setEnCours(false);
    if (error) { setErreur("Erreur : " + error.message); return; }
    onEnregistre();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{estVente ? "Marquer vendu" : "Réserver ce bien"}</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 12 }}>{bien.nom}</div>
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

function ModalPaiementsVente({ workspace, bien, onFermer, onMaj, genererRecuVentePDF }) {
  const [paiements, setPaiements] = useState([]);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("especes");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const reste = Math.max(0, Number(bien.prix_vente) - Number(bien.montant_recu || 0));

  const charger = useCallback(async () => {
    const { data } = await supabase.from("paiements_vente").select("*").eq("bien_vente_id", bien.id).order("date_paiement", { ascending: false });
    setPaiements(data || []);
  }, [bien.id]);
  useEffect(() => { charger(); }, [charger]);

  async function encaisser() {
    setErreur("");
    const m = Number(montant);
    if (!m || m <= 0) { setErreur("Indique un montant valide."); return; }
    if (m > reste + 0.01) { setErreur(`Ce montant dépasse le reste à payer (${nb(reste)} ${devise(workspace.currency)}).`); return; }
    setEnCours(true);
    const { error } = await supabase.from("paiements_vente").insert([{ bien_vente_id: bien.id, workspace_id: workspace.id, montant: m, mode, date_paiement: ajourdhuiISO() }]);
    setEnCours(false);
    if (error) { setErreur(error.message.includes("dépasse") ? error.message : "Erreur : " + error.message); return; }
    setMontant("");
    await charger();
    await onMaj();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{bien.nom}</div>
        <div style={{ fontSize: 12.5, color: COULEURS.gris, marginBottom: 10 }}>Prix {nb(bien.prix_vente)} {devise(workspace.currency)}, déjà reçu {nb(bien.montant_recu)} {devise(workspace.currency)}</div>
        {reste > 0 ? (
          <div style={{ background: "#F4F1E8", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Encaisser (reste {nb(reste)} {devise(workspace.currency)})</div>
            <input style={S.champ} type="number" placeholder="Montant reçu" value={montant} onChange={(e) => setMontant(e.target.value)} />
            <select style={S.champ} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="especes">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement</option>
              <option value="autre">Autre</option>
            </select>
            <button onClick={() => setMontant(String(reste))} style={{ ...S.boutonClair, width: "100%", marginBottom: 8, padding: "8px 0", fontSize: 12 }}>Payer le solde ({nb(reste)})</button>
            {erreur && <div style={{ color: COULEURS.rougeFonce, fontSize: 12, marginBottom: 8 }}>{erreur}</div>}
            <button disabled={enCours} onClick={encaisser} style={{ ...S.bouton, width: "100%" }}>{enCours ? "…" : "✅ Encaisser"}</button>
          </div>
        ) : (
          <div style={{ background: "#EAF7F1", color: "#1F9D6E", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>Ce bien est intégralement payé.</div>
        )}
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Historique des paiements</div>
        {paiements.length === 0 && <div style={{ fontSize: 12.5, color: COULEURS.grisClair }}>Aucun paiement enregistré.</div>}
        {paiements.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #F1EFE8" }}>
            <span>{new Date(p.date_paiement).toLocaleDateString("fr-FR")} · {p.mode}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{nb(p.montant)} {devise(workspace.currency)}</span>
              {genererRecuVentePDF && <button onClick={() => genererRecuVentePDF(p, bien)} style={{ background: "none", border: "none", color: COULEURS.vert, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>🧾 Reçu</button>}
            </span>
          </div>
        ))}
        <button onClick={onFermer} style={{ ...S.boutonClair, width: "100%", marginTop: 12 }}>Fermer</button>
      </div>
    </div>
  );
}

// Publication d'une fiche publique (section 21-27 du cahier des charges « fiches commerciales ») :
// activer/désactiver la fiche, obtenir son lien + QR code + message WhatsApp, voir ses statistiques.
// Générique : réutilisé pour biens_vente, vehicules_vente et logements (même table de destination
// passée en prop). N'affiche rien de privé (adresse précise, acheteur...) — uniquement ce que la
// fonction publique fiche_commerciale_public() renverrait de toute façon.
function PanneauPublierFiche({ workspace, typeEntite, entite, table, onMaj }) {
  const [ouvert, setOuvert] = useState(false);
  const [stats, setStats] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const lien = urlFichePublique(typeEntite, entite.id);

  async function basculerPublie() {
    setEnCours(true);
    const nouveauPublie = !entite.publie;
    await supabase.from(table).update({ publie: nouveauPublie, statut_fiche: nouveauPublie ? "active" : "brouillon" }).eq("id", entite.id);
    setEnCours(false);
    await onMaj();
  }

  useEffect(() => {
    if (!ouvert || !entite.publie) return;
    supabase.rpc("stats_fiche_commerciale", { p_workspace_id: workspace.id, p_type_entite: typeEntite, p_entite_id: entite.id })
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
                  <a href={messageWhatsAppPartageFiche(entite.titre_annonce || entite.nom, entite.prix_vente ?? entite.loyer_mensuel, devise(workspace.currency), lien)} target="_blank" rel="noopener noreferrer" style={{ background: "#25d366", color: "white", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>💬 Partager sur WhatsApp</a>
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

function OngletVentes({ workspace, biensVente, role, recharger, genererRecuVentePDF, genererCompromisVentePDF }) {
  const [filtre, setFiltre] = useState("tous");
  const [formOuvert, setFormOuvert] = useState(null); // null | "new" | bien (édition)
  const [reservationOuverte, setReservationOuverte] = useState(null); // { bien, statutCible }
  const [paiementsOuvert, setPaiementsOuvert] = useState(null);

  const stats = useMemo(() => {
    const disponibles = biensVente.filter((b) => b.statut === "disponible").length;
    const reserves = biensVente.filter((b) => b.statut === "reserve").length;
    const vendus = biensVente.filter((b) => b.statut === "vendu");
    const valeurPortefeuille = biensVente.filter((b) => b.statut !== "vendu").reduce((s, b) => s + Number(b.prix_vente || 0), 0);
    const encaisseSurVentes = vendus.reduce((s, b) => s + Number(b.montant_recu || 0), 0);
    const resteAEncaisser = vendus.reduce((s, b) => s + Math.max(0, Number(b.prix_vente) - Number(b.montant_recu || 0)), 0);
    return { disponibles, reserves, vendus: vendus.length, valeurPortefeuille, encaisseSurVentes, resteAEncaisser };
  }, [biensVente]);

  const filtres = biensVente.filter((b) => filtre === "tous" || b.statut === filtre);

  return (
    <div>
      <div style={{ ...S.carte, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tuile label="Disponibles" valeur={String(stats.disponibles)} />
        <Tuile label="Réservés" valeur={String(stats.reserves)} couleur={COULEURS.ambre} />
        <Tuile label="Vendus" valeur={String(stats.vendus)} couleur={COULEURS.vert} />
        <Tuile label="Valeur du stock à vendre" valeur={`${nb(stats.valeurPortefeuille)} ${devise(workspace.currency)}`} />
        {stats.resteAEncaisser > 0 && <Tuile label="Reste à encaisser (ventes en cours)" valeur={`${nb(stats.resteAEncaisser)} ${devise(workspace.currency)}`} couleur={COULEURS.rouge} />}
      </div>

      {peutEcrire(role) && (
        <div style={S.carte}>
          <button onClick={() => setFormOuvert("new")} style={{ ...S.bouton, width: "100%" }}>+ Ajouter un bien à vendre</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {[["tous", "Tous"], ["disponible", "Disponibles"], ["reserve", "Réservés"], ["vendu", "Vendus"]].map(([k, l]) => (
          <div key={k} onClick={() => setFiltre(k)} style={{ ...S.onglet(filtre === k), flex: "1 1 auto", minWidth: 90 }}>{l}</div>
        ))}
      </div>

      {filtres.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun bien dans ce filtre.</div>}

      {filtres.map((b) => {
        const reste = Math.max(0, Number(b.prix_vente) - Number(b.montant_recu || 0));
        return (
          <div key={b.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 10 }}>
              {(b.photos?.[0] || b.photo_url) && (
                <img src={b.photos?.[0] || b.photo_url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.titre_annonce || b.nom}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>
                  {(TYPES_BIEN_VENTE.find(([k]) => k === b.type_bien) || [, b.type_bien])[1]}
                  {(b.quartier || b.ville || b.adresse) ? ` · ${[b.quartier, b.ville].filter(Boolean).join(", ") || b.adresse}` : ""}
                  {b.superficie ? ` · ${b.superficie} m²` : ""}
                  {b.nombre_chambres ? ` · ${b.nombre_chambres} ch.` : (b.nombre_pieces ? ` · ${b.nombre_pieces} pièces` : "")}
                  {b.nombre_salles_bain ? ` · ${b.nombre_salles_bain} SDB` : ""}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: COULEURS.vert, marginTop: 6 }}>
                  {nb(b.prix_vente)} {devise(workspace.currency)}{b.prix_negociable ? " (négociable)" : ""}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: FOND_STATUT_VENTE[b.statut], color: COULEUR_STATUT_VENTE[b.statut], whiteSpace: "nowrap" }}>
                {LIBELLE_STATUT_VENTE[b.statut]}
              </span>
            </div>
            {(b.statut === "reserve" || b.statut === "vendu") && (
              <div style={{ fontSize: 12.5, color: COULEURS.vertFonce, marginBottom: 6 }}>
                Acheteur : <strong>{b.acheteur_nom}</strong>{b.acheteur_tel ? ` · ${b.acheteur_tel}` : ""}
                {b.statut === "vendu" && <> · Reçu {nb(b.montant_recu)}{reste > 0 && <span style={{ color: COULEURS.rougeFonce, fontWeight: 700 }}> · Reste {nb(reste)}</span>} {devise(workspace.currency)}</>}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {peutEcrire(role) && <button onClick={() => setFormOuvert(b)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>✏️ Modifier</button>}
              {peutEcrire(role) && b.statut === "disponible" && <button onClick={() => setReservationOuverte({ bien: b, statutCible: "reserve" })} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>🤝 Réserver</button>}
              {peutEcrire(role) && (b.statut === "disponible" || b.statut === "reserve") && <button onClick={() => setReservationOuverte({ bien: b, statutCible: "vendu" })} style={{ ...S.bouton, padding: "7px 12px", fontSize: 12 }}>✅ Marquer vendu</button>}
              {b.statut === "vendu" && <button onClick={() => setPaiementsOuvert(b)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>💰 Paiements</button>}
              {b.statut === "vendu" && <button onClick={() => genererCompromisVentePDF(b)} style={{ ...S.boutonClair, padding: "7px 12px", fontSize: 12 }}>📄 Compromis PDF</button>}
            </div>
            {b.statut !== "vendu" && (
              <PanneauPublierFiche workspace={workspace} typeEntite="bien_vente" entite={b} table="biens_vente" onMaj={recharger} />
            )}
          </div>
        );
      })}

      {formOuvert && (
        <FormBienVente
          workspace={workspace}
          bien={formOuvert === "new" ? null : formOuvert}
          onFermer={() => setFormOuvert(null)}
          onEnregistre={async () => { setFormOuvert(null); await recharger(); }}
        />
      )}
      {reservationOuverte && (
        <FormReserverVendre
          workspace={workspace}
          bien={reservationOuverte.bien}
          statutCible={reservationOuverte.statutCible}
          onFermer={() => setReservationOuverte(null)}
          onEnregistre={async () => { setReservationOuverte(null); await recharger(); }}
        />
      )}
      {paiementsOuvert && (
        <ModalPaiementsVente
          workspace={workspace}
          bien={biensVente.find((b) => b.id === paiementsOuvert.id) || paiementsOuvert}
          onFermer={() => setPaiementsOuvert(null)}
          onMaj={recharger}
          genererRecuVentePDF={genererRecuVentePDF}
        />
      )}
    </div>
  );
}

// ============================================================================
//  PDF : quittance de loyer & contrat de bail (style de genererFacturePDF)
// ============================================================================
function genererQuittancePDF(loyer, bail, logement, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text((workspace.name || "").toUpperCase(), 15, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(workspace.country || "", 15, 25);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("QUITTANCE DE LOYER", 195, 18, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(moisLabel(loyer.periode), 195, 25, { align: "right" });

  let y = 46;
  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.text("LOCATAIRE", 15, y);
  doc.text("LOGEMENT", 120, y);
  y += 6;
  doc.setTextColor(...dark);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(bail?.locataire_nom || "", 15, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(logement?.nom || "", 120, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  if (bail?.locataire_tel) doc.text(bail.locataire_tel, 15, y);
  if (logement?.adresse) doc.text(logement.adresse, 120, y, { maxWidth: 75 });

  y += 16;
  const paye = Number(loyer.montant_paye || 0);
  const du = Number(loyer.montant_du || 0);
  const soldePourSolde = paye >= du;
  doc.setFillColor(...green);
  doc.rect(15, y, 180, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DÉTAIL", 18, y + 6);
  doc.text("MONTANT", 190, y + 6, { align: "right" });
  y += 9;
  doc.setDrawColor(230, 230, 225);
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.rect(15, y, 180, 12);
  doc.text(`Loyer ${moisLabel(loyer.periode)}`, 18, y + 8);
  doc.text(`${nb(paye)} ${devise(workspace.currency)}`, 190, y + 8, { align: "right" });

  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(soldePourSolde ? "REÇU POUR SOLDE DE TOUT COMPTE" : "REÇU EN ACOMPTE", 15, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  doc.text(`Montant dû : ${nb(du)} ${devise(workspace.currency)} — Payé à ce jour : ${nb(paye)} ${devise(workspace.currency)}${!soldePourSolde ? ` — Reste : ${nb(du - paye)} ${devise(workspace.currency)}` : ""}`, 15, y, { maxWidth: 180 });

  y += 20;
  doc.setDrawColor(...gray);
  doc.line(120, y, 195, y);
  doc.setFontSize(9);
  doc.text("Signature du propriétaire", 120, y + 5);

  doc.save(`quittance-${(bail?.locataire_nom || "locataire").replace(/\s+/g, "-")}-${loyer.periode}.pdf`);
}

function genererContratPDF(bail, logement, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CONTRAT DE BAIL SIMPLE", 15, 17);

  let y = 36;
  doc.setTextColor(...dark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const lignes = [
    `Entre le propriétaire, ${workspace.name || "le bailleur"}${workspace.country ? " (" + workspace.country + ")" : ""},`,
    `et le locataire, ${bail.locataire_nom}${bail.locataire_tel ? " (tél. " + bail.locataire_tel + ")" : ""}${bail.locataire_piece_identite ? ", pièce d'identité n° " + bail.locataire_piece_identite : ""},`,
    "il est convenu ce qui suit :",
  ];
  lignes.forEach((l) => { doc.text(l, 15, y, { maxWidth: 180 }); y += 6; });

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("1. Logement loué", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`${logement?.nom || ""}${logement?.adresse ? ", " + logement.adresse : ""}`, 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("2. Durée", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Bail à compter du ${new Date(bail.date_debut).toLocaleDateString("fr-FR")}${bail.date_fin ? " jusqu'au " + new Date(bail.date_fin).toLocaleDateString("fr-FR") : ", durée indéterminée"}.`, 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("3. Loyer et échéance", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Loyer mensuel de ${nb(bail.loyer_mensuel)} ${devise(bail.devise || workspace.currency)}, payable au plus tard le ${bail.jour_echeance} de chaque mois.`, 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("4. Caution", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(Number(bail.caution) > 0 ? `Caution de ${nb(bail.caution)} ${devise(bail.devise || workspace.currency)}, restituable en fin de bail déduction faite des dégâts constatés.` : "Aucune caution demandée.", 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("5. Conditions générales", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const conditions = [
    "Le locataire s'engage à occuper les lieux paisiblement et à payer le loyer aux échéances convenues.",
    "Le propriétaire s'engage à maintenir le logement en état d'usage normal.",
    "Toute dégradation constatée au départ du locataire peut être déduite de la caution.",
    "Le présent contrat peut être résilié par accord entre les deux parties, avec un préavis raisonnable.",
  ];
  conditions.forEach((c) => { doc.text("• " + c, 15, y, { maxWidth: 180 }); y += 6; });
  doc.setFontSize(10);

  y += 10;
  doc.setDrawColor(...gray);
  doc.line(15, y, 85, y);
  doc.line(125, y, 195, y);
  doc.setFontSize(9);
  doc.text("Signature du propriétaire", 15, y + 5);
  doc.text("Signature du locataire", 125, y + 5);

  y += 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text("Modèle indicatif — à faire valider selon la loi de ton pays avant usage officiel.", 15, y, { maxWidth: 180 });

  doc.save(`contrat-bail-${bail.locataire_nom.replace(/\s+/g, "-")}.pdf`);
}

// ============================================================================
//  PDF : reçu de paiement & compromis de vente (LOT 5, même style que ci-dessus)
// ============================================================================
function genererRecuVentePDF(paiement, bien, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text((workspace.name || "").toUpperCase(), 15, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(workspace.country || "", 15, 25);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REÇU DE VENTE", 195, 18, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(paiement.date_paiement).toLocaleDateString("fr-FR"), 195, 25, { align: "right" });

  let y = 46;
  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.text("ACHETEUR", 15, y);
  doc.text("BIEN", 120, y);
  y += 6;
  doc.setTextColor(...dark);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(bien?.acheteur_nom || "", 15, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(bien?.nom || "", 120, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  if (bien?.acheteur_tel) doc.text(bien.acheteur_tel, 15, y);
  if (bien?.adresse) doc.text(bien.adresse, 120, y, { maxWidth: 75 });

  y += 16;
  doc.setFillColor(...green);
  doc.rect(15, y, 180, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DÉTAIL", 18, y + 6);
  doc.text("MONTANT", 190, y + 6, { align: "right" });
  y += 9;
  doc.setDrawColor(230, 230, 225);
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.rect(15, y, 180, 12);
  doc.text(`Paiement reçu (${paiement.mode || "espèces"})`, 18, y + 8);
  doc.text(`${nb(paiement.montant)} ${devise(workspace.currency)}`, 190, y + 8, { align: "right" });

  y += 20;
  const prix = Number(bien?.prix_vente || 0);
  const recu = Number(bien?.montant_recu || 0);
  const soldePourSolde = recu >= prix;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(soldePourSolde ? "REÇU POUR SOLDE DE TOUT COMPTE" : "REÇU EN ACOMPTE", 15, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  doc.text(`Prix de vente : ${nb(prix)} ${devise(workspace.currency)} — Reçu à ce jour : ${nb(recu)} ${devise(workspace.currency)}${!soldePourSolde ? ` — Reste : ${nb(prix - recu)} ${devise(workspace.currency)}` : ""}`, 15, y, { maxWidth: 180 });

  y += 20;
  doc.setDrawColor(...gray);
  doc.line(120, y, 195, y);
  doc.setFontSize(9);
  doc.text("Signature du vendeur", 120, y + 5);

  doc.save(`recu-vente-${(bien?.acheteur_nom || "acheteur").replace(/\s+/g, "-")}-${paiement.date_paiement}.pdf`);
}

function genererCompromisVentePDF(bien, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COMPROMIS DE VENTE", 15, 17);

  let y = 36;
  doc.setTextColor(...dark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const lignes = [
    `Entre le vendeur, ${workspace.name || "le vendeur"}${workspace.country ? " (" + workspace.country + ")" : ""},`,
    `et l'acheteur, ${bien.acheteur_nom || ""}${bien.acheteur_tel ? " (tél. " + bien.acheteur_tel + ")" : ""}${bien.acheteur_email ? ", email " + bien.acheteur_email : ""},`,
    "il est convenu ce qui suit :",
  ];
  lignes.forEach((l) => { doc.text(l, 15, y, { maxWidth: 180 }); y += 6; });

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("1. Bien vendu", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const typeLabel = (TYPES_BIEN_VENTE.find(([k]) => k === bien.type_bien) || [, bien.type_bien])[1];
  const localisationTxt = [bien.quartier, bien.ville, bien.pays].filter(Boolean).join(", ") || bien.adresse;
  const caracsTxt = [
    bien.superficie ? `${bien.superficie} m² habitables` : null,
    bien.superficie_terrain ? `${bien.superficie_terrain} m² de terrain` : null,
    bien.nombre_chambres ? `${bien.nombre_chambres} chambre(s)` : null,
    bien.nombre_salles_bain ? `${bien.nombre_salles_bain} salle(s) de bain` : null,
  ].filter(Boolean).join(", ");
  doc.text(`${bien.nom} (${typeLabel})${localisationTxt ? ", " + localisationTxt : ""}`, 15, y, { maxWidth: 180 }); y += 6;
  if (caracsTxt) { doc.text(caracsTxt, 15, y, { maxWidth: 180 }); y += 6; }
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("2. Prix et modalités", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const prix = Number(bien.prix_vente || 0);
  const recu = Number(bien.montant_recu || 0);
  doc.text(`Prix de vente convenu : ${nb(prix)} ${devise(workspace.currency)}. Déjà reçu à ce jour : ${nb(recu)} ${devise(workspace.currency)}${recu < prix ? `, reste ${nb(prix - recu)} ${devise(workspace.currency)}` : " (intégralement payé)"}.`, 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("3. Date de vente", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(bien.date_vente ? new Date(bien.date_vente).toLocaleDateString("fr-FR") : "Non renseignée.", 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("4. Conditions générales", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const conditions = [
    "L'acheteur reconnaît avoir visité le bien et l'accepter en l'état.",
    "Le transfert de propriété définitif intervient après paiement intégral du prix convenu.",
    "Toute condition suspensive (financement, notaire...) doit être formalisée séparément selon la loi locale.",
  ];
  conditions.forEach((c) => { doc.text("• " + c, 15, y, { maxWidth: 180 }); y += 6; });
  doc.setFontSize(10);

  y += 10;
  doc.setDrawColor(...gray);
  doc.line(15, y, 85, y);
  doc.line(125, y, 195, y);
  doc.setFontSize(9);
  doc.text("Signature du vendeur", 15, y + 5);
  doc.text("Signature de l'acheteur", 125, y + 5);

  y += 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text("Modèle indicatif — à faire valider par un notaire ou un juriste selon la loi de ton pays avant usage officiel.", 15, y, { maxWidth: 180 });

  doc.save(`compromis-vente-${(bien.acheteur_nom || bien.nom || "bien").replace(/\s+/g, "-")}.pdf`);
}

// ============================================================================
//  Composant principal
// ============================================================================
export default function LocationMaison({ workspace, session, onClose }) {
  const { logements, baux, loyers, biensVente, chargement, recharger } = useDonneesLocation(workspace);
  const [onglet, setOnglet] = useState("logements");
  const [preselectionBail, setPreselectionBail] = useState(null);

  // Génération idempotente côté client à l'ouverture (au cas où le cron aurait manqué un jour) :
  // insère uniquement, ne touche à rien d'existant, la contrainte unique empêche tout doublon.
  useEffect(() => {
    (async () => {
      try {
        const auj = new Date();
        const aujISO = ajourdhuiISO();
        const moisCourant = premierDuMoisISO(auj);
        const moisSuivant = premierDuMoisISO(new Date(auj.getFullYear(), auj.getMonth() + 1, 1));
        const { data: bauxActifs } = await supabase.from("baux").select("*").eq("workspace_id", workspace.id).eq("statut", "actif");
        for (const bail of bauxActifs || []) {
          const echeanceCourante = dateEcheancePourPeriode(moisCourant, bail.jour_echeance);
          // Comparaison en jours calendaires (date-only), jamais de Date locale mélangée à une
          // date UTC : évite tout décalage d'un jour selon le fuseau horaire.
          const joursAvantEcheance = Math.round((new Date(echeanceCourante + "T00:00:00Z") - new Date(aujISO + "T00:00:00Z")) / 86400000);
          for (const periode of [moisCourant, ...(joursAvantEcheance <= 5 ? [moisSuivant] : [])]) {
            const debutBail = premierDuMoisISO(bail.date_debut);
            if (periode < debutBail) continue;
            if (bail.date_fin && periode > premierDuMoisISO(bail.date_fin)) continue;
            const echeance = dateEcheancePourPeriode(periode, bail.jour_echeance);
            await supabase.from("loyers").insert([{ workspace_id: workspace.id, bail_id: bail.id, periode, montant_du: bail.loyer_mensuel, date_echeance: echeance }]);
            // Erreur (doublon 23505) attendue et silencieuse : la ligne existe déjà.
          }
        }
        await recharger();
      } catch (_) { /* silencieux : le cron serveur reste la source de vérité quotidienne */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  function ouvrirCreationBail(logement) {
    setPreselectionBail(logement);
    setOnglet("baux");
  }

  function relancerWhatsApp(loyer, bail) {
    const reste = Math.max(0, Number(loyer.montant_du) - Number(loyer.montant_paye || 0));
    const texte = `Bonjour ${(bail.locataire_nom || "").split(" ")[0]}, j'espère que tu vas bien 🙏.\n\nPetit rappel concernant le loyer de ${moisLabel(loyer.periode)} : il reste ${nb(reste)} ${devise(workspace.currency)} à régler.\n\nMerci de me faire signe dès que possible pour le règlement. Bonne journée !`;
    window.open(`https://wa.me/${cleanPhoneForWhatsApp(bail.locataire_tel)}?text=${encodeURIComponent(texte)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: COULEURS.fond, zIndex: 70, display: "flex", flexDirection: "column" }}>
      <div style={{ background: COULEURS.vertFonce, color: "white", padding: "16px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>🏠 Immobilier — Location & Vente</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>✕ Fermer</button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        <div style={S.section}>
          {onglet !== "ventes" && <TableauDeBord workspace={workspace} logements={logements} baux={baux} loyers={loyers} />}

          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
            {[["logements", "Logements"], ["baux", "Baux"], ["loyers", "Loyers"], ["ventes", "🏷️ Ventes"]].map(([k, l]) => (
              <div key={k} onClick={() => setOnglet(k)} style={{ ...S.onglet(onglet === k), flex: "1 1 auto", minWidth: 90 }}>{l}</div>
            ))}
          </div>

          {chargement ? (
            <div style={{ textAlign: "center", color: COULEURS.grisClair, padding: 30 }}>Chargement…</div>
          ) : (
            <>
              {onglet === "logements" && (
                <OngletLogements
                  workspace={workspace} logements={logements} baux={baux} loyers={loyers}
                  role={workspace.role} recharger={recharger} ouvrirBail={ouvrirCreationBail}
                />
              )}
              {onglet === "baux" && (
                <OngletBaux
                  workspace={workspace} logements={logements} baux={baux} role={workspace.role} recharger={recharger}
                  preselection={preselectionBail} consommerPreselection={() => setPreselectionBail(null)}
                  genererContratPDF={(b) => genererContratPDF(b, logements.find((l) => l.id === b.logement_id), workspace)}
                />
              )}
              {onglet === "loyers" && (
                <OngletLoyers
                  workspace={workspace} baux={baux} loyers={loyers} logements={logements} role={workspace.role} recharger={recharger}
                  genererQuittancePDF={(l, b, lg) => genererQuittancePDF(l, b, lg, workspace)}
                  relancerWhatsApp={relancerWhatsApp}
                />
              )}
              {onglet === "ventes" && (
                <OngletVentes
                  workspace={workspace} biensVente={biensVente} role={workspace.role} recharger={recharger}
                  genererRecuVentePDF={(p, b) => genererRecuVentePDF(p, b, workspace)}
                  genererCompromisVentePDF={(b) => genererCompromisVentePDF(b, workspace)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
