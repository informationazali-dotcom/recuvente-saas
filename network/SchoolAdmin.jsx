import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Écran admin "🎓 School" — gestion des niveaux, cours, et questions de quiz.
export default function SchoolAdmin({ workspace, filleuls }) {
  const [niveaux, setNiveaux] = useState([]);
  const [cours, setCours] = useState([]);
  const [progressionTous, setProgressionTous] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [niveauOuvert, setNiveauOuvert] = useState(null);
  const [coursOuvert, setCoursOuvert] = useState(null);
  const [showAjoutNiveau, setShowAjoutNiveau] = useState(false);
  const [showAjoutCours, setShowAjoutCours] = useState(null); // niveau_id ou null
  const [onglet, setOnglet] = useState("contenu"); // contenu | progression
  const [rechercheCours, setRechercheCours] = useState("");

  async function deplacerCours(coursDuNiveau, index, direction) {
    const cible = coursDuNiveau[index + direction];
    const courant = coursDuNiveau[index];
    if (!cible) return;
    await Promise.all([
      supabase.from("ecole_cours").update({ ordre: cible.ordre }).eq("id", courant.id),
      supabase.from("ecole_cours").update({ ordre: courant.ordre }).eq("id", cible.id),
    ]);
    await charger();
  }

  async function charger() {
    setChargement(true);
    const [{ data: n }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("ecole_niveaux").select("*").eq("workspace_id", workspace.id).order("ordre"),
      supabase.from("ecole_cours").select("*").eq("workspace_id", workspace.id).order("ordre"),
      supabase.from("ecole_progression").select("filleul_id, cours_id, statut").eq("workspace_id", workspace.id),
    ]);
    setNiveaux(n || []);
    setCours(c || []);
    setProgressionTous(p || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [workspace.id]);

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F" }}>🎓 School</div>
        {onglet === "contenu" && (
          <button onClick={() => setShowAjoutNiveau(true)} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            + Niveau
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ECE8DC" }}>
        {[{ key: "contenu", label: "Contenu" }, { key: "progression", label: "📊 Progression" }].map((o) => (
          <button key={o.key} onClick={() => setOnglet(o.key)} style={{
            background: "none", border: "none", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            color: onglet === o.key ? "#1a7a3c" : "#8A9089",
            borderBottom: onglet === o.key ? "2px solid #1a7a3c" : "2px solid transparent", marginBottom: -1,
          }}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "progression" && (
        <ProgressionEcole filleuls={filleuls || []} cours={cours} progressionTous={progressionTous} carte={carte} />
      )}

      {onglet === "contenu" && (
      <>
      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && niveaux.length === 0 && <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucun niveau — crée le premier pour commencer à construire la formation.</div>}

      {niveaux.length > 0 && cours.length > 3 && (
        <input
          placeholder="🔍 Rechercher un cours..."
          value={rechercheCours}
          onChange={(e) => setRechercheCours(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 12 }}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {niveaux.map((n) => {
          const q = rechercheCours.trim().toLowerCase();
          const coursDuNiveau = cours.filter((c) => c.niveau_id === n.id && (!q || c.titre.toLowerCase().includes(q)));
          if (q && coursDuNiveau.length === 0) return null;
          return (
            <div key={n.id} style={carte}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setNiveauOuvert(niveauOuvert === n.id ? null : n.id)}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#16231F" }}>{n.nom} {!n.actif && <span style={{ color: "#8A9089", fontWeight: 500 }}>(inactif)</span>}</div>
                  <div style={{ fontSize: 11, color: "#8A9089" }}>{coursDuNiveau.length} cours</div>
                </div>
                <div style={{ fontSize: 16 }}>{(niveauOuvert === n.id || q) ? "▾" : "▸"}</div>
              </div>

              {(niveauOuvert === n.id || q) && (
                <div style={{ marginTop: 12, borderTop: "1px solid #ECE8DC", paddingTop: 12 }}>
                  {coursDuNiveau.map((c, i) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0", borderBottom: "1px solid #F3F1EA" }}>
                      {!q && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <button onClick={(e) => { e.stopPropagation(); deplacerCours(coursDuNiveau, i, -1); }} disabled={i === 0} style={{ background: "none", border: "none", fontSize: 10, cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.3 : 1, lineHeight: 1, padding: 0 }}>▲</button>
                          <button onClick={(e) => { e.stopPropagation(); deplacerCours(coursDuNiveau, i, 1); }} disabled={i === coursDuNiveau.length - 1} style={{ background: "none", border: "none", fontSize: 10, cursor: i === coursDuNiveau.length - 1 ? "not-allowed" : "pointer", opacity: i === coursDuNiveau.length - 1 ? 0.3 : 1, lineHeight: 1, padding: 0 }}>▼</button>
                        </div>
                      )}
                      <div onClick={() => setCoursOuvert(c)} style={{ flex: 1, display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                        <div style={{ fontSize: 12.5 }}>{{ video: "🎥", texte: "📄", quiz: "❓", reponse_libre: "✍️" }[c.type]} {c.titre}</div>
                        <div style={{ fontSize: 11, color: "#8A9089" }}>{c.actif ? "" : "inactif"}</div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setShowAjoutCours(n.id)} style={{ marginTop: 8, background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                    + Cours
                  </button>
                  <NiveauActions niveau={n} coursDuNiveau={coursDuNiveau} onChange={charger} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>
      )}

      {showAjoutNiveau && <AjoutNiveauModal workspace={workspace} onClose={() => setShowAjoutNiveau(false)} onCree={async () => { setShowAjoutNiveau(false); await charger(); }} />}
      {showAjoutCours && <AjoutCoursModal workspace={workspace} niveauId={showAjoutCours} coursExistants={cours} onClose={() => setShowAjoutCours(null)} onCree={async () => { setShowAjoutCours(null); await charger(); }} />}
      {coursOuvert && <FicheCoursModal cours={coursOuvert} onClose={() => setCoursOuvert(null)} onChange={charger} />}
    </div>
  );
}

function NiveauActions({ niveau, coursDuNiveau, onChange }) {
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(niveau.nom);
  const [enCours, setEnCours] = useState(false);

  async function renommer() {
    if (!nom.trim()) return;
    setEnCours(true);
    await supabase.from("ecole_niveaux").update({ nom: nom.trim(), updated_at: new Date().toISOString() }).eq("id", niveau.id);
    setEnCours(false);
    setEdition(false);
    await onChange();
  }

  async function basculerActif() {
    setEnCours(true);
    await supabase.from("ecole_niveaux").update({ actif: !niveau.actif, updated_at: new Date().toISOString() }).eq("id", niveau.id);
    setEnCours(false);
    await onChange();
  }

  async function supprimer() {
    if (coursDuNiveau.length > 0) {
      window.alert("Ce niveau contient encore des cours — supprime-les d'abord (ou déplace-les) avant de supprimer le niveau.");
      return;
    }
    if (!window.confirm(`Supprimer le niveau "${niveau.nom}" ?`)) return;
    setEnCours(true);
    await supabase.from("ecole_niveaux").delete().eq("id", niveau.id);
    setEnCours(false);
    await onChange();
  }

  if (edition) {
    return (
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <input value={nom} onChange={(e) => setNom(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }} />
        <button onClick={renommer} disabled={enCours} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>OK</button>
        <button onClick={() => setEdition(false)} style={{ background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
      <button onClick={() => setEdition(true)} style={{ background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✏️ Renommer</button>
      <button onClick={basculerActif} disabled={enCours} style={{ background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{niveau.actif ? "⏸️ Désactiver" : "✅ Activer"}</button>
      <button onClick={supprimer} disabled={enCours} style={{ background: "#FBEAEA", color: "#D64933", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑️</button>
    </div>
  );
}

function AjoutNiveauModal({ workspace, onClose, onCree }) {
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    if (!nom.trim()) return;
    setEnCours(true);
    const { count } = await supabase.from("ecole_niveaux").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
    await supabase.from("ecole_niveaux").insert([{ workspace_id: workspace.id, nom: nom.trim(), description: description.trim() || null, ordre: count || 0 }]);
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Nouveau niveau</div>
        <input placeholder="Nom (ex: Diamant 1)" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} autoFocus />
        <textarea placeholder="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />
        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : "Créer"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

function AjoutCoursModal({ workspace, niveauId, coursExistants, onClose, onCree }) {
  const [titre, setTitre] = useState("");
  const [type, setType] = useState("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [contenu, setContenu] = useState("");
  const [criteresEvaluation, setCriteresEvaluation] = useState("");
  const [prealableId, setPrealableId] = useState("");
  const [ancienneteMin, setAncienneteMin] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    if (!titre.trim()) return;
    setEnCours(true);
    const { count } = await supabase.from("ecole_cours").select("id", { count: "exact", head: true }).eq("niveau_id", niveauId);
    await supabase.from("ecole_cours").insert([{
      workspace_id: workspace.id, niveau_id: niveauId, titre: titre.trim(), type,
      video_url: type === "video" ? videoUrl.trim() || null : null,
      contenu: (type === "texte" || type === "reponse_libre") ? contenu.trim() || null : null,
      criteres_evaluation: type === "reponse_libre" ? criteresEvaluation.trim() || null : null,
      cours_prealable_id: prealableId || null,
      anciennete_jours_min: ancienneteMin ? Number(ancienneteMin) : null,
      ordre: count || 0,
    }]);
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Nouveau cours</div>
        <input placeholder="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} autoFocus />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }}>
          <option value="video">🎥 Vidéo</option>
          <option value="texte">📄 Texte</option>
          <option value="quiz">❓ Quiz QCM/vrai-faux (questions à ajouter ensuite)</option>
          <option value="reponse_libre">✍️ Question ouverte (corrigée par l'IA)</option>
        </select>
        {type === "video" && <input placeholder="URL de la vidéo (mp4, ou lien direct)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />}
        {type === "texte" && <textarea placeholder="Contenu du cours" value={contenu} onChange={(e) => setContenu(e.target.value)} rows={4} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />}
        {type === "reponse_libre" && (
          <>
            <textarea placeholder="Question posée au filleul" value={contenu} onChange={(e) => setContenu(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />
            <textarea placeholder="Ce qu'une bonne réponse doit contenir (guide l'IA pour la correction)" value={criteresEvaluation} onChange={(e) => setCriteresEvaluation(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />
          </>
        )}
        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Cours préalable requis (optionnel)</label>
        <select value={prealableId} onChange={(e) => setPrealableId(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginTop: 4, marginBottom: 10, fontSize: 13 }}>
          <option value="">Aucun — toujours accessible</option>
          {coursExistants.map((c) => <option key={c.id} value={c.id}>{c.titre}</option>)}
        </select>
        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Ancienneté minimum du filleul, en jours (optionnel)</label>
        <input type="number" placeholder="ex: 30" value={ancienneteMin} onChange={(e) => setAncienneteMin(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginTop: 4, marginBottom: 10, fontSize: 13 }} />
        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : "Créer le cours"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

function FicheCoursModal({ cours, onClose, onChange }) {
  const [questions, setQuestions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [showAjoutQuestion, setShowAjoutQuestion] = useState(false);
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(cours.titre);
  const [videoUrl, setVideoUrl] = useState(cours.video_url || "");
  const [contenu, setContenu] = useState(cours.contenu || "");
  const [actif, setActif] = useState(cours.actif);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const { data } = await supabase.from("ecole_quiz_questions").select("*").eq("cours_id", cours.id).order("ordre");
    setQuestions(data || []);
    setChargement(false);
  }
  useEffect(() => { if (cours.type === "quiz") charger(); else setChargement(false); }, [cours.id]);

  async function enregistrerModifications() {
    setEnCours(true);
    await supabase.from("ecole_cours").update({
      titre: titre.trim(), actif,
      video_url: cours.type === "video" ? videoUrl.trim() || null : cours.video_url,
      contenu: cours.type === "texte" ? contenu.trim() || null : cours.contenu,
      updated_at: new Date().toISOString(),
    }).eq("id", cours.id);
    setEnCours(false);
    setEdition(false);
    await onChange();
  }

  async function supprimerQuestion(id) {
    await supabase.from("ecole_quiz_questions").delete().eq("id", id);
    await charger();
  }

  async function supprimerCours() {
    if (!window.confirm(`Supprimer "${cours.titre}" ? Cette action est irréversible — la progression des filleuls sur ce cours sera perdue.`)) return;
    setEnCours(true);
    await supabase.from("ecole_cours").delete().eq("id", cours.id);
    setEnCours(false);
    await onChange();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto" }}>
        {!edition ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{cours.titre} {!cours.actif && <span style={{ color: "#8A9089", fontWeight: 500, fontSize: 12 }}>(inactif)</span>}</div>
            <button onClick={() => setEdition(true)} style={{ background: "none", border: "none", color: "#5b3ba8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✏️ Modifier</button>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 8, fontSize: 13, fontWeight: 700 }} />
            {cours.type === "video" && <input placeholder="URL de la vidéo" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 8, fontSize: 12.5 }} />}
            {cours.type === "texte" && <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={4} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 8, fontSize: 12.5, resize: "vertical" }} />}
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 10 }}>
              <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Cours actif (visible par les filleuls)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={enregistrerModifications} disabled={enCours} style={{ flex: 1, background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Enregistrer</button>
              <button onClick={() => setEdition(false)} style={{ flex: 1, background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 16 }}>{{ video: "🎥 Vidéo", texte: "📄 Texte", quiz: "❓ Quiz", reponse_libre: "✍️ Question ouverte (IA)" }[cours.type]}{cours.type === "quiz" ? ` · seuil de réussite ${cours.quiz_seuil_reussite}%` : ""}</div>
        {cours.type === "reponse_libre" && (
          <div style={{ fontSize: 11.5, color: "#6B7168", background: "#F7FAF7", borderRadius: 9, padding: "9px 11px", marginBottom: 14, lineHeight: 1.5 }}>
            <strong>Question :</strong> {cours.contenu || "(non définie)"}<br /><br />
            <strong>Critères :</strong> {cours.criteres_evaluation || "(non définis)"}
          </div>
        )}

        {cours.type === "quiz" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: "#F7FAF7", borderRadius: 9, padding: "9px 11px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{i + 1}. {q.question}</div>
                    <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 3 }}>{q.type === "qcm" ? `${(q.options || []).length} options` : "Vrai/Faux"}</div>
                  </div>
                  <button onClick={() => supprimerQuestion(q.id)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>Suppr.</button>
                </div>
              ))}
              {questions.length === 0 && !chargement && <div style={{ fontSize: 11.5, color: "#8A9089" }}>Aucune question pour l'instant.</div>}
            </div>
            <button onClick={() => setShowAjoutQuestion(true)} style={{ width: "100%", background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              + Ajouter une question
            </button>
          </>
        )}

        <button onClick={supprimerCours} disabled={enCours} style={{ width: "100%", background: "#FBEAEA", color: "#D64933", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
          🗑️ Supprimer ce cours
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>

      {showAjoutQuestion && (
        <AjoutQuestionModal coursId={cours.id} onClose={() => setShowAjoutQuestion(false)} onCree={async () => { setShowAjoutQuestion(false); await charger(); }} />
      )}
    </div>
  );
}

function AjoutQuestionModal({ coursId, onClose, onCree }) {
  const [question, setQuestion] = useState("");
  const [type, setType] = useState("qcm");
  const [options, setOptions] = useState([{ id: "a", texte: "" }, { id: "b", texte: "" }]);
  const [bonneReponse, setBonneReponse] = useState("a");
  const [bonneReponseVF, setBonneReponseVF] = useState(true);
  const [enCours, setEnCours] = useState(false);

  function majOption(i, texte) {
    setOptions((o) => o.map((opt, idx) => (idx === i ? { ...opt, texte } : opt)));
  }
  function ajouterOption() {
    const lettre = String.fromCharCode(97 + options.length);
    setOptions((o) => [...o, { id: lettre, texte: "" }]);
  }

  async function creer() {
    if (!question.trim()) return;
    setEnCours(true);
    const { count } = await supabase.from("ecole_quiz_questions").select("id", { count: "exact", head: true }).eq("cours_id", coursId);
    await supabase.from("ecole_quiz_questions").insert([{
      cours_id: coursId, question: question.trim(), type,
      options: type === "qcm" ? options.filter((o) => o.texte.trim()) : null,
      bonne_reponse: type === "qcm" ? bonneReponse : bonneReponseVF,
      ordre: count || 0,
    }]);
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 110 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Nouvelle question</div>
        <textarea placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 8, fontSize: 12.5, resize: "vertical" }} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 12.5 }}>
          <option value="qcm">Choix multiple (QCM)</option>
          <option value="vrai_faux">Vrai / Faux</option>
        </select>

        {type === "qcm" ? (
          <>
            {options.map((opt, i) => (
              <div key={opt.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input type="radio" checked={bonneReponse === opt.id} onChange={() => setBonneReponse(opt.id)} />
                <input placeholder={`Option ${opt.id.toUpperCase()}`} value={opt.texte} onChange={(e) => majOption(i, e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }} />
              </div>
            ))}
            <button onClick={ajouterOption} style={{ fontSize: 11, color: "#5b3ba8", background: "none", border: "none", cursor: "pointer", marginBottom: 10 }}>+ Ajouter une option</button>
            <div style={{ fontSize: 10, color: "#8A9089", marginBottom: 10 }}>Coche le bouton radio de la bonne réponse.</div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="radio" checked={bonneReponseVF === true} onChange={() => setBonneReponseVF(true)} /> Vrai</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="radio" checked={bonneReponseVF === false} onChange={() => setBonneReponseVF(false)} /> Faux</label>
          </div>
        )}

        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : "Ajouter"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

// Vue "Progression" (§33 — profil 360°, visibilité formation) : jamais
// construite jusqu'ici — l'admin n'avait aucun moyen de savoir qui a
// terminé quoi. Comptages réels uniquement, rien d'inventé.
function ProgressionEcole({ filleuls, cours, progressionTous, carte }) {
  const totalCours = cours.filter((c) => c.actif).length;
  if (totalCours === 0) {
    return <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucun cours actif — la progression apparaîtra ici une fois du contenu créé.</div>;
  }
  if (filleuls.length === 0) {
    return <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucun filleul pour l'instant.</div>;
  }

  const lignes = filleuls.map((f) => {
    const mesProg = progressionTous.filter((p) => p.filleul_id === f.id);
    const termines = mesProg.filter((p) => p.statut === "completed").length;
    const enCours = mesProg.filter((p) => p.statut === "in_progress").length;
    return { filleul: f, termines, enCours, pourcentage: totalCours > 0 ? Math.round((termines / totalCours) * 100) : 0 };
  }).sort((a, b) => b.pourcentage - a.pourcentage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lignes.map((l) => (
        <div key={l.filleul.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{l.filleul.nom}</div>
            <div style={{ fontSize: 10.5, color: "#8A9089" }}>{l.termines}/{totalCours} terminés{l.enCours > 0 ? ` · ${l.enCours} en cours` : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 80, height: 6, background: "#F3F1EA", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${l.pourcentage}%`, height: "100%", background: l.pourcentage === 100 ? "#1a7a3c" : "#6b3fd4" }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: l.pourcentage === 100 ? "#1a7a3c" : "#16231F", minWidth: 32, textAlign: "right" }}>{l.pourcentage}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}
