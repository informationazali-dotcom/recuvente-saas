import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import {
  TYPES_ENTITE_FICHE, ETAPES_PIPELINE, COULEUR_ETAPE_PIPELINE, STATUTS_RDV_FICHE,
  urlFichePublique, cleanPhoneForWhatsAppFiche,
} from "./fichesCommercialesUtils.js";

// ============================================================================
//  LOT 7 — Panneau interne « Prospects & fiches commerciales » : tous les
//  prospects/questions/rendez-vous venus des fiches publiques (immobilier vente,
//  véhicule vente, logement en location), quelle que soit l'activité. Générique,
//  pas dupliqué par activité (section 22 du cahier des charges).
//  Fichier autonome (comme LocationMaison.jsx, LocationVoiture.jsx...).
// ============================================================================

const COULEURS = {
  vert: "#1a7a3c", vertFonce: "#16231F", fond: "#FAFAF7", carte: "#FFFFFF",
  bordure: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", rougeFonce: "#B23A26",
  gris: "#6B7168", grisClair: "#8A9089",
};
function nb(x) { return Number(x || 0).toLocaleString("fr-FR"); }
function devise(code) { return code === "XOF" || code === "XAF" ? "F CFA" : (code || "F CFA"); }
function peutEcrire(role) { return role === "owner" || role === "admin" || role === "comptable"; }

const S = {
  carte: { background: COULEURS.carte, border: `1px solid ${COULEURS.bordure}`, borderRadius: 14, padding: 14, marginBottom: 12 },
  champ: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13.5, boxSizing: "border-box", background: "white", marginBottom: 8 },
  bouton: { background: COULEURS.vert, color: "white", border: "none", borderRadius: 9, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: COULEURS.vertFonce, border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 12.5, cursor: "pointer" },
  onglet: (actif) => ({ flex: "0 0 auto", textAlign: "center", padding: "10px 12px", fontSize: 12, fontWeight: 700, borderRadius: 9, cursor: "pointer", background: actif ? COULEURS.vert : "transparent", color: actif ? "white" : COULEURS.gris, whiteSpace: "nowrap" }),
};

function useDonneesFiches(workspace) {
  const [prospects, setProspects] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [rdvs, setRdvs] = useState([]);
  const [biensVente, setBiensVente] = useState([]);
  const [vehiculesVente, setVehiculesVente] = useState([]);
  const [logements, setLogements] = useState([]);
  const [charge, setCharge] = useState(false);

  const recharger = useCallback(async () => {
    if (!workspace?.id) return;
    const req = (table) => supabase.from(table).select("*").eq("workspace_id", workspace.id).then((r) => r.data || []).catch(() => []);
    const [p, q, r, bv, vv, lg] = await Promise.all([
      supabase.from("prospects_fiches").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("questions_fiches").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("rendez_vous_fiches").select("*").eq("workspace_id", workspace.id).order("date", { ascending: true }),
      req("biens_vente"), req("vehicules_vente"), req("logements"),
    ]);
    setProspects(p.data || []);
    setQuestions(q.data || []);
    setRdvs(r.data || []);
    setBiensVente(bv); setVehiculesVente(vv); setLogements(lg);
    setCharge(true);
  }, [workspace?.id]);

  useEffect(() => { recharger(); }, [recharger]);

  const fichesParCle = useMemo(() => {
    const m = new Map();
    biensVente.forEach((b) => m.set("bien_vente:" + b.id, b));
    vehiculesVente.forEach((v) => m.set("vehicule_vente:" + v.id, v));
    logements.forEach((l) => m.set("logement:" + l.id, l));
    return m;
  }, [biensVente, vehiculesVente, logements]);

  function fiche(typeEntite, entiteId) { return fichesParCle.get(`${typeEntite}:${entiteId}`) || null; }
  function nomFiche(typeEntite, entiteId) {
    const f = fiche(typeEntite, entiteId);
    return f ? (f.titre_annonce || f.nom) : "(fiche supprimée)";
  }
  function prixFiche(typeEntite, entiteId) {
    const f = fiche(typeEntite, entiteId);
    if (!f) return null;
    return typeEntite === "logement" ? f.loyer_mensuel : f.prix_vente;
  }

  return { prospects, questions, rdvs, biensVente, vehiculesVente, logements, charge, recharger, fiche, nomFiche, prixFiche };
}

function genererBonCommandeFichePDF(prospect, fiche, typeEntite, workspace) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60], gray = [107, 113, 104], dark = [22, 35, 31];
  const estVehicule = typeEntite === "vehicule_vente";
  doc.setFillColor(...green); doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(`BON DE COMMANDE — ${estVehicule ? "VÉHICULE" : "IMMOBILIER"}`, 15, 17);

  let y = 36;
  doc.setTextColor(...dark); doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const reference = `BC-${new Date().getFullYear()}-${String(prospect.id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  doc.text(`Référence : ${reference}`, 15, y); y += 8;

  doc.setFont("helvetica", "bold"); doc.text("Bien / véhicule", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const prix = typeEntite === "logement" ? fiche?.loyer_mensuel : fiche?.prix_vente;
  doc.text(`${fiche ? (fiche.titre_annonce || fiche.nom) : "—"}${prix ? " — " + nb(prix) + " " + devise(workspace.currency) + (typeEntite === "logement" ? "/mois" : "") : ""}`, 15, y, { maxWidth: 180 }); y += 10;

  doc.setFont("helvetica", "bold"); doc.text("Acquéreur / prospect", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`${prospect.nom}${prospect.telephone ? " — " + prospect.telephone : ""}${prospect.email ? " — " + prospect.email : ""}`, 15, y, { maxWidth: 180 }); y += 6;
  if (prospect.ville || prospect.quartier) { doc.text(`${[prospect.quartier, prospect.ville].filter(Boolean).join(", ")}`, 15, y); y += 6; }
  y += 4;

  doc.setFont("helvetica", "bold"); doc.text("Demande", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Type : ${prospect.type_demande || "—"}${prospect.budget ? " — Budget indicatif : " + nb(prospect.budget) + " " + devise(workspace.currency) : ""}`, 15, y, { maxWidth: 180 }); y += 6;
  if (prospect.date_visite_souhaitee) { doc.text(`Visite souhaitée : ${new Date(prospect.date_visite_souhaitee).toLocaleDateString("fr-FR")}`, 15, y); y += 6; }
  if (prospect.commentaire) { doc.text(`Observations : ${prospect.commentaire}`, 15, y, { maxWidth: 180 }); y += 8; }

  y += 6;
  doc.setFont("helvetica", "bold"); doc.text("Conditions", 15, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("• Ce document est une intention de commande, à confirmer par un contrat/bon de vente signé.", 15, y, { maxWidth: 180 }); y += 6;
  doc.text("• Toute condition suspensive (financement, documents...) doit être formalisée séparément.", 15, y, { maxWidth: 180 }); y += 6;
  doc.setFontSize(10);

  y += 12; doc.setDrawColor(...gray); doc.line(15, y, 85, y); doc.line(125, y, 195, y);
  doc.setFontSize(9); doc.text("Signature du vendeur", 15, y + 5); doc.text("Signature du client", 125, y + 5);

  doc.save(`${reference}-${(prospect.nom || "client").replace(/\s+/g, "-")}.pdf`);
}

export default function ProspectsFiches({ workspace, session, onClose }) {
  const donnees = useDonneesFiches(workspace);
  const [onglet, setOnglet] = useState("prospects");
  const role = workspace?.role;

  const ONGLETS = [
    { cle: "prospects", label: "👤 Prospects", n: donnees.prospects.length },
    { cle: "questions", label: "❓ Questions", n: donnees.questions.filter((q) => !q.reponse).length },
    { cle: "rendez_vous", label: "📅 Rendez-vous", n: donnees.rdvs.filter((r) => r.statut === "demande").length },
    { cle: "mes_fiches", label: "🏷️ Mes fiches" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: COULEURS.fond, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: COULEURS.vertFonce, color: "white", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>📋 Prospects & fiches commerciales</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
          {ONGLETS.map((o) => (
            <div key={o.cle} onClick={() => setOnglet(o.cle)} style={S.onglet(onglet === o.cle)}>
              {o.label}{typeof o.n === "number" && o.n > 0 && <span style={{ marginLeft: 5, background: onglet === o.cle ? "white" : COULEURS.ambre, color: onglet === o.cle ? COULEURS.ambre : "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 800 }}>{o.n}</span>}
            </div>
          ))}
        </div>
      </div>

      {!donnees.charge && <div style={{ textAlign: "center", color: COULEURS.grisClair, padding: 50 }}>Chargement…</div>}

      {donnees.charge && (
        <div style={{ padding: "16px 16px 90px" }}>
          {onglet === "prospects" && <OngletProspects workspace={workspace} donnees={donnees} role={role} />}
          {onglet === "questions" && <OngletQuestions workspace={workspace} donnees={donnees} role={role} />}
          {onglet === "rendez_vous" && <OngletRendezVous workspace={workspace} donnees={donnees} role={role} />}
          {onglet === "mes_fiches" && <OngletMesFiches workspace={workspace} donnees={donnees} />}
        </div>
      )}
    </div>
  );
}

function OngletProspects({ workspace, donnees, role }) {
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [ouvert, setOuvert] = useState(null); // id du prospect ouvert

  async function changerStatut(p, nouveauStatut) {
    if (!peutEcrire(role)) return;
    const historique = [...(Array.isArray(p.historique) ? p.historique : []), { statut: nouveauStatut, le: new Date().toISOString() }];
    await supabase.from("prospects_fiches").update({ statut: nouveauStatut, historique, updated_at: new Date().toISOString() }).eq("id", p.id);
    await donnees.recharger();
  }

  const liste = donnees.prospects.filter((p) => filtreStatut === "tous" || p.statut === filtreStatut);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        <div onClick={() => setFiltreStatut("tous")} style={{ ...S.onglet(filtreStatut === "tous"), flex: "0 0 auto" }}>Tous ({donnees.prospects.length})</div>
        {ETAPES_PIPELINE.map(([k, l]) => (
          <div key={k} onClick={() => setFiltreStatut(k)} style={{ ...S.onglet(filtreStatut === k), flex: "0 0 auto" }}>{l}</div>
        ))}
      </div>
      {liste.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun prospect dans ce filtre.</div>}
      {liste.map((p) => {
        const fiche = donnees.fiche(p.type_entite, p.entite_id);
        const questionsProspect = donnees.questions.filter((q) => q.prospect_id === p.id);
        const rdvProspect = donnees.rdvs.filter((r) => r.prospect_id === p.id);
        return (
          <div key={p.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }} onClick={() => setOuvert(ouvert === p.id ? null : p.id)}>
              <div style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nom}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>{TYPES_ENTITE_FICHE[p.type_entite]?.label} · {donnees.nomFiche(p.type_entite, p.entite_id)}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.gris, marginTop: 2 }}>{p.telephone}{p.type_demande ? ` · ${p.type_demande}` : ""}{p.budget ? ` · Budget ${nb(p.budget)} ${devise(workspace.currency)}` : ""}</div>
              </div>
              <a href={`https://wa.me/${cleanPhoneForWhatsAppFiche(p.telephone)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ background: "#25d366", color: "white", borderRadius: 6, padding: "6px 9px", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>💬</a>
            </div>
            <div style={{ marginTop: 8 }}>
              <select value={p.statut} onChange={(e) => changerStatut(p, e.target.value)} disabled={!peutEcrire(role)} style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 6, border: `1px solid ${COULEUR_ETAPE_PIPELINE[p.statut]}`, color: COULEUR_ETAPE_PIPELINE[p.statut], background: "white", fontWeight: 700 }}>
                {ETAPES_PIPELINE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {ouvert === p.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COULEURS.bordure}` }}>
                {p.commentaire && <div style={{ fontSize: 12, color: COULEURS.gris, marginBottom: 8 }}>💬 {p.commentaire}</div>}
                {questionsProspect.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 4 }}>Questions posées</div>
                    {questionsProspect.map((q) => <div key={q.id} style={{ fontSize: 12, marginBottom: 2 }}>• {q.question}{q.reponse ? <span style={{ color: COULEURS.vert }}> → {q.reponse}</span> : <span style={{ color: COULEURS.ambre }}> (sans réponse)</span>}</div>)}
                  </div>
                )}
                {rdvProspect.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.grisClair, marginBottom: 4 }}>Rendez-vous</div>
                    {rdvProspect.map((r) => <div key={r.id} style={{ fontSize: 12, marginBottom: 2 }}>• {new Date(r.date).toLocaleDateString("fr-FR")}{r.heure ? ` à ${r.heure.slice(0, 5)}` : ""} — {STATUTS_RDV_FICHE[r.statut]?.label}</div>)}
                  </div>
                )}
                <button onClick={() => genererBonCommandeFichePDF(p, fiche, p.type_entite, workspace)} style={{ ...S.boutonClair, width: "100%" }}>📄 Générer le bon de commande</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OngletQuestions({ workspace, donnees, role }) {
  const [reponses, setReponses] = useState({});
  async function repondre(q) {
    const texte = (reponses[q.id] || "").trim();
    if (!texte) return;
    await supabase.from("questions_fiches").update({ reponse: texte, repondu_par: (workspace.role || "équipe"), repondu_at: new Date().toISOString() }).eq("id", q.id);
    await donnees.recharger();
  }
  return (
    <div>
      {donnees.questions.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucune question pour l'instant.</div>}
      {donnees.questions.map((q) => (
        <div key={q.id} style={S.carte}>
          <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginBottom: 4 }}>{donnees.nomFiche(q.type_entite, q.entite_id)} · {q.nom || "Anonyme"}{q.telephone ? ` · ${q.telephone}` : ""}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{q.question}</div>
          {q.reponse ? (
            <div style={{ background: "#EAF7F1", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#1F9D6E" }}>Réponse : {q.reponse}</div>
          ) : peutEcrire(role) ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...S.champ, marginBottom: 0, flex: 1 }} placeholder="Ta réponse…" value={reponses[q.id] || ""} onChange={(e) => setReponses({ ...reponses, [q.id]: e.target.value })} />
              <button onClick={() => repondre(q)} style={{ ...S.bouton, flexShrink: 0 }}>Envoyer</button>
              {q.telephone && <a href={`https://wa.me/${cleanPhoneForWhatsAppFiche(q.telephone)}?text=${encodeURIComponent((reponses[q.id] || "") + " ")}`} target="_blank" rel="noopener noreferrer" style={{ background: "#25d366", color: "white", borderRadius: 8, padding: "9px 11px", fontSize: 12, textDecoration: "none", flexShrink: 0 }}>💬</a>}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function OngletRendezVous({ workspace, donnees, role }) {
  async function changerStatut(r, statut) {
    if (!peutEcrire(role)) return;
    await supabase.from("rendez_vous_fiches").update({ statut, updated_at: new Date().toISOString() }).eq("id", r.id);
    await donnees.recharger();
  }
  return (
    <div>
      {donnees.rdvs.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucun rendez-vous pour l'instant.</div>}
      {donnees.rdvs.map((r) => {
        const p = donnees.prospects.find((pp) => pp.id === r.prospect_id);
        const info = STATUTS_RDV_FICHE[r.statut];
        return (
          <div key={r.id} style={S.carte}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p?.nom || "—"} · {r.type_demande}</div>
                <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>{donnees.nomFiche(r.type_entite, r.entite_id)}</div>
                <div style={{ fontSize: 12, color: COULEURS.gris, marginTop: 2 }}>{new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{r.heure ? ` à ${r.heure.slice(0, 5)}` : ""}</div>
                {r.notes && <div style={{ fontSize: 12, color: COULEURS.gris, marginTop: 4 }}>💬 {r.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <select value={r.statut} onChange={(e) => changerStatut(r, e.target.value)} disabled={!peutEcrire(role)} style={{ fontSize: 10.5, padding: "5px 8px", borderRadius: 6, border: `1px solid ${info.couleur}`, color: info.couleur, background: "white", fontWeight: 700 }}>
                  {Object.entries(STATUTS_RDV_FICHE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {p?.telephone && <a href={`https://wa.me/${cleanPhoneForWhatsAppFiche(p.telephone)}?text=${encodeURIComponent(`Bonjour ${p.nom}, à propos de votre demande de rendez-vous du ${new Date(r.date).toLocaleDateString("fr-FR")}...`)}`} target="_blank" rel="noopener noreferrer" style={{ background: "#25d366", color: "white", borderRadius: 6, padding: "6px 9px", fontSize: 12, textDecoration: "none" }}>💬</a>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OngletMesFiches({ workspace, donnees }) {
  const [filtreType, setFiltreType] = useState("tous");
  const toutes = [
    ...donnees.biensVente.map((b) => ({ ...b, __type: "bien_vente" })),
    ...donnees.vehiculesVente.map((v) => ({ ...v, __type: "vehicule_vente" })),
    ...donnees.logements.map((l) => ({ ...l, __type: "logement" })),
  ];
  const liste = toutes.filter((f) => filtreType === "tous" || f.__type === filtreType);

  async function changerStatutFiche(f) {
    const table = f.__type === "bien_vente" ? "biens_vente" : f.__type === "vehicule_vente" ? "vehicules_vente" : "logements";
    const ordre = ["brouillon", "active", "archivee"];
    const suivant = ordre[(ordre.indexOf(f.statut_fiche) + 1) % ordre.length];
    await supabase.from(table).update({ statut_fiche: suivant, publie: suivant === "active" }).eq("id", f.id);
    await donnees.recharger();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {[["tous", "Toutes"], ["bien_vente", "Immobilier vente"], ["vehicule_vente", "Véhicules vente"], ["logement", "Location"]].map(([k, l]) => (
          <div key={k} onClick={() => setFiltreType(k)} style={{ ...S.onglet(filtreType === k), flex: "0 0 auto" }}>{l}</div>
        ))}
      </div>
      {liste.length === 0 && <div style={{ textAlign: "center", color: COULEURS.grisClair, fontSize: 13, padding: "30px 0" }}>Aucune fiche.</div>}
      {liste.map((f) => (
        <div key={f.__type + f.id} style={S.carte}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{f.titre_annonce || f.nom}</div>
              <div style={{ fontSize: 11.5, color: COULEURS.grisClair, marginTop: 2 }}>
                {TYPES_ENTITE_FICHE[f.__type]?.label}
                {f.__type === "logement" ? ` · ${nb(f.loyer_mensuel)} ${devise(workspace.currency)}/mois · ${f.disponible ? "Libre" : "Occupé"}` : ` · ${nb(f.prix_vente)} ${devise(workspace.currency)} · ${f.statut}`}
              </div>
            </div>
            <span onClick={() => changerStatutFiche(f)} style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: f.statut_fiche === "active" ? "#EAF3DE" : f.statut_fiche === "archivee" ? "#F1EFE8" : "#FBF3E3", color: f.statut_fiche === "active" ? "#3B6D11" : f.statut_fiche === "archivee" ? COULEURS.grisClair : COULEURS.ambre }}>
              {f.statut_fiche === "active" ? "🟢 Active" : f.statut_fiche === "archivee" ? "⬛ Archivée" : "📝 Brouillon"}
            </span>
          </div>
          {f.publie && <a href={urlFichePublique(f.__type, f.id)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: COULEURS.vert, marginTop: 6, display: "inline-block" }}>🔗 Voir la fiche publique</a>}
        </div>
      ))}
    </div>
  );
}
