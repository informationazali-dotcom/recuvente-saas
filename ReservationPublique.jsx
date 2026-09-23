import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  LOT 4 — Réservation publique de véhicules, ouverte à TOUTES les boutiques
//  "location_vehicule" (contrairement au catalogue codé en dur pour "luxury-car"
//  dans CataloguePublic.jsx, qui n'est PAS touché ici et continue de fonctionner).
//  Route : "?location=<slug>" (voir main.jsx). Tout le calcul de prix et le contrôle
//  de chevauchement se fait CÔTÉ SERVEUR (RPC creer_reservation_publique), jamais
//  confiance à ce que le navigateur envoie.
// ============================================================================

const VERT = "#1a7a3c", FOND = "#FAFAF7", BORDURE = "#ECE8DC", GRIS = "#6B7168", GRIS_CLAIR = "#8A9089", ROUGE = "#D64933";

function devise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : (code || "F CFA");
}
function nb(x) {
  return Number(x || 0).toLocaleString("fr-FR");
}
function ajourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function demainISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function joursEntre(debut, fin) {
  if (!debut || !fin) return 0;
  return Math.max(1, Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1);
}

export default function ReservationPublique({ slug }) {
  const [dateDebut, setDateDebut] = useState(ajourdhuiISO());
  const [dateFin, setDateFin] = useState(demainISO());
  const [vehicules, setVehicules] = useState(null); // null = chargement, [] = vide
  const [erreurChargement, setErreurChargement] = useState(false);
  const [vehiculeOuvert, setVehiculeOuvert] = useState(null);

  useEffect(() => { document.title = "Réserver un véhicule"; }, []);

  useEffect(() => {
    if (!slug) { setErreurChargement(true); setVehicules([]); return; }
    let annule = false;
    setVehicules(null);
    supabase.rpc("vehicules_disponibles_public", { p_slug: slug, p_debut: dateDebut || null, p_fin: dateFin || null })
      .then(({ data, error }) => {
        if (annule) return;
        if (error) { setErreurChargement(true); setVehicules([]); return; }
        setVehicules(data || []);
      });
    return () => { annule = true; };
  }, [slug, dateDebut, dateFin]);

  const entreprise = vehicules && vehicules.length > 0 ? { nom: vehicules[0].workspace_nom, devise: vehicules[0].devise } : null;

  if (vehiculeOuvert) {
    return (
      <FicheVehicule
        slug={slug}
        vehicule={vehiculeOuvert}
        entreprise={entreprise}
        dateDebut={dateDebut}
        dateFin={dateFin}
        onRetour={() => setVehiculeOuvert(null)}
      />
    );
  }

  return (
    <div style={{ background: FOND, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16231F" }}>
      <div style={{ background: "#0F3D26", color: "white", padding: "26px 16px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 26, marginBottom: 6 }}>🚗</div>
        <h1 style={{ fontSize: 21, margin: "0 0 4px", fontWeight: 800 }}>{entreprise?.nom || "Réserver un véhicule"}</h1>
        <p style={{ margin: "0 auto", maxWidth: 420, fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}>
          Choisis tes dates, réserve directement en ligne. Le loueur te contactera pour confirmer.
        </p>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 50px" }}>
        <div style={{ background: "white", border: `1px solid ${BORDURE}`, borderRadius: 14, padding: 14, marginBottom: 16, display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: GRIS_CLAIR, marginBottom: 4 }}>Début</div>
            <input type="date" value={dateDebut} min={ajourdhuiISO()} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: GRIS_CLAIR, marginBottom: 4 }}>Fin</div>
            <input type="date" value={dateFin} min={dateDebut || ajourdhuiISO()} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
          </div>
        </div>

        {vehicules === null && <div style={{ textAlign: "center", color: GRIS_CLAIR, padding: 40 }}>Chargement…</div>}

        {vehicules !== null && vehicules.length === 0 && (
          <div style={{ textAlign: "center", color: GRIS, padding: "40px 10px", fontSize: 14 }}>
            {/* La fonction publique renvoie une liste vide aussi bien pour une boutique introuvable que pour
                une boutique sans véhicule disponible sur ces dates (aucune erreur SQL distincte dans les deux
                cas) : le message reste donc volontairement neutre plutôt que d'affirmer une cause précise. */}
            🔍 Boutique introuvable ou aucun véhicule disponible pour la location sur ces dates. Essaie une autre période.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(vehicules || []).map((v) => {
            const nbJours = joursEntre(dateDebut, dateFin);
            const estime = nbJours * Number(v.prix_jour || 0);
            return (
              <div key={v.id} onClick={() => setVehiculeOuvert(v)} style={{ background: "white", border: `1px solid ${BORDURE}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", display: "flex" }}>
                {v.photo_url ? (
                  <img src={v.photo_url} alt="" style={{ width: 100, height: 100, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 100, height: 100, background: "#EEF0EA", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🚗</div>
                )}
                <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: VERT, textTransform: "uppercase", letterSpacing: "0.03em" }}>{v.categorie || "Véhicule"}</div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nom}</div>
                  <div style={{ fontSize: 12, color: GRIS, marginTop: 4 }}>{nb(v.prix_jour)} {devise(v.devise)} / jour</div>
                  {nbJours > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: VERT, marginTop: 4 }}>≈ {nb(estime)} {devise(v.devise)} pour {nbJours} j</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: GRIS_CLAIR, marginTop: 30 }}>Propulsé par RecuVente</div>
      </div>
    </div>
  );
}

const champStyle = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" };

function FicheVehicule({ slug, vehicule, entreprise, dateDebut: dateDebutInit, dateFin: dateFinInit, onRetour }) {
  const [dateDebut, setDateDebut] = useState(dateDebutInit);
  const [dateFin, setDateFin] = useState(dateFinInit);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState(null); // { commande_id }

  const nbJours = joursEntre(dateDebut, dateFin);
  const estime = nbJours * Number(vehicule.prix_jour || 0);
  const formValide = nom.trim().length >= 2 && tel.trim().length >= 8 && dateDebut && dateFin && nbJours > 0;

  async function envoyer() {
    if (!formValide) return;
    setEnCours(true);
    setErreur("");
    const { data, error } = await supabase.rpc("creer_reservation_publique", {
      p_slug: slug, p_bien_id: vehicule.id, p_client: nom.trim(), p_tel: tel.trim(),
      p_date_debut: dateDebut, p_date_fin: dateFin, p_note: note.trim() || null,
    });
    setEnCours(false);
    const r = data && data[0];
    if (error || !r?.succes) { setErreur(r?.message || "Erreur, réessaie."); return; }
    try {
      if (r.commande_id) fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "nouvelle_commande", commandeId: r.commande_id }), keepalive: true }).catch(() => {});
    } catch (_) {}
    setResultat(r);
  }

  if (resultat) {
    return (
      <div style={{ background: FOND, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "white", border: `1px solid ${BORDURE}`, borderRadius: 16, padding: 30, textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Demande envoyée !</div>
          <div style={{ color: GRIS, fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>{resultat.message}</div>
          <button onClick={onRetour} style={{ background: VERT, color: "white", border: "none", borderRadius: 10, padding: "11px 24px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: FOND, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16231F" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ position: "relative" }}>
          {vehicule.photo_url ? (
            <img src={vehicule.photo_url} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: 200, background: "#0F3D26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🚗</div>
          )}
          <button onClick={onRetour} style={{ position: "absolute", top: 14, left: 14, width: 34, height: 34, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.92)", fontSize: 16, cursor: "pointer" }}>←</button>
        </div>

        <div style={{ padding: "18px 16px 60px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: VERT, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{vehicule.categorie || "Véhicule"}</div>
          <div style={{ fontWeight: 800, fontSize: 21, marginBottom: 6 }}>{vehicule.nom}</div>
          <div style={{ fontSize: 13.5, color: GRIS, marginBottom: 4 }}>{nb(vehicule.prix_jour)} {devise(vehicule.devise || entreprise?.devise)} / jour{Number(vehicule.caution_suggeree) > 0 && ` · Caution ${nb(vehicule.caution_suggeree)} ${devise(vehicule.devise || entreprise?.devise)}`}</div>
          {vehicule.description && <div style={{ fontSize: 13, color: GRIS, lineHeight: 1.6, marginTop: 10 }}>{vehicule.description}</div>}

          <div style={{ background: "white", border: `1px solid ${BORDURE}`, borderRadius: 14, padding: 16, marginTop: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Réserver</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: GRIS_CLAIR, marginBottom: 4 }}>Début</div>
                <input type="date" value={dateDebut} min={ajourdhuiISO()} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: GRIS_CLAIR, marginBottom: 4 }}>Fin</div>
                <input type="date" value={dateFin} min={dateDebut || ajourdhuiISO()} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
              </div>
            </div>
            <input placeholder="Ton nom complet" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...champStyle, marginBottom: 8 }} />
            <input placeholder="Ton numéro de téléphone (WhatsApp)" value={tel} onChange={(e) => setTel(e.target.value)} style={{ ...champStyle, marginBottom: 8 }} />
            <textarea placeholder="Message ou précisions (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...champStyle, fontFamily: "inherit", marginBottom: 10 }} />

            {nbJours > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${BORDURE}`, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{nbJours} jour{nbJours > 1 ? "s" : ""}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: VERT }}>≈ {nb(estime)} {devise(vehicule.devise || entreprise?.devise)}</span>
              </div>
            )}
            <div style={{ fontSize: 10.5, color: GRIS_CLAIR, marginBottom: 10 }}>Le montant exact est recalculé et confirmé par le loueur.</div>

            {erreur && <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#B23A26", marginBottom: 10 }}>{erreur}</div>}

            <button onClick={envoyer} disabled={!formValide || enCours} style={{ width: "100%", background: (!formValide || enCours) ? "#DDD8CC" : VERT, color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: (!formValide || enCours) ? "default" : "pointer" }}>
              {enCours ? "Envoi…" : "Envoyer la demande de réservation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
