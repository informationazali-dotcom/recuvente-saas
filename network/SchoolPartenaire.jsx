import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Espace "🎓 School" du partenaire — niveaux, cours, vidéos avec reprise de
// lecture, quiz corrigés côté serveur, déblocage progressif.
export default function SchoolPartenaire({ filleul, workspace }) {
  const [niveaux, setNiveaux] = useState([]);
  const [cours, setCours] = useState([]);
  const [progression, setProgression] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [coursOuvert, setCoursOuvert] = useState(null);

  async function charger() {
    setChargement(true);
    const [{ data: n }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("ecole_niveaux").select("*").eq("workspace_id", workspace.id).eq("actif", true).order("ordre"),
      supabase.from("ecole_cours").select("*").eq("workspace_id", workspace.id).eq("actif", true).order("ordre"),
      supabase.from("ecole_progression").select("*").eq("filleul_id", filleul.id),
    ]);
    setNiveaux(n || []);
    setCours(c || []);
    setProgression(p || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [filleul.id]);

  function progressionDe(coursId) {
    return progression.find((p) => p.cours_id === coursId);
  }
  function estDebloque(c) {
    if (!c.cours_prealable_id) return true;
    const prog = progressionDe(c.cours_prealable_id);
    return prog?.statut === "completed";
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  if (chargement) return <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>🎓 Ma formation</div>

      {niveaux.length === 0 && <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucune formation disponible pour l'instant.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {niveaux.map((n) => {
          const coursDuNiveau = cours.filter((c) => c.niveau_id === n.id);
          const termines = coursDuNiveau.filter((c) => progressionDe(c.id)?.statut === "completed").length;
          return (
            <div key={n.id} style={carte}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{n.nom}</div>
                <div style={{ fontSize: 10.5, color: "#8A9089" }}>{termines}/{coursDuNiveau.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {coursDuNiveau.map((c) => {
                  const debloque = estDebloque(c);
                  const prog = progressionDe(c.id);
                  const statutIcone = !debloque ? "🔒" : prog?.statut === "completed" ? "✅" : prog?.statut === "in_progress" ? "🔄" : "⚪";
                  return (
                    <div
                      key={c.id}
                      onClick={() => debloque && setCoursOuvert(c)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", borderRadius: 9, background: debloque ? "#F7FAF7" : "#FAFAFA", cursor: debloque ? "pointer" : "not-allowed", opacity: debloque ? 1 : 0.6 }}
                    >
                      <div style={{ fontSize: 12 }}>{statutIcone} {{ video: "🎥", texte: "📄", quiz: "❓", reponse_libre: "✍️" }[c.type]} {c.titre}</div>
                      {prog?.pourcentage_video > 0 && prog.statut !== "completed" && <div style={{ fontSize: 10, color: "#8A9089" }}>{prog.pourcentage_video}%</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {coursOuvert && (
        <FicheCoursPartenaireModal
          cours={coursOuvert}
          progression={progressionDe(coursOuvert.id)}
          workspace={workspace}
          onClose={() => setCoursOuvert(null)}
          onChange={charger}
        />
      )}
    </div>
  );
}

function FicheCoursPartenaireModal({ cours, progression, workspace, onClose, onChange }) {
  const [enCours, setEnCours] = useState(false);

  async function marquerTermine() {
    setEnCours(true);
    await supabase.rpc("ecole_marquer_cours_termine", { p_cours_id: cours.id });
    setEnCours(false);
    await onChange();
    onClose();
  }

  async function majProgressionVideo(e) {
    const video = e.target;
    if (!video.duration) return;
    const pourcentage = Math.round((video.currentTime / video.duration) * 100);
    await supabase.rpc("ecole_enregistrer_progression_video", {
      p_cours_id: cours.id, p_position_secondes: Math.round(video.currentTime), p_pourcentage: pourcentage,
    });
    if (pourcentage >= 95) await onChange();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 110, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{cours.titre}</div>

        {cours.type === "video" && cours.video_url && (
          <>
            <video
              src={cours.video_url}
              controls
              style={{ width: "100%", borderRadius: 10, marginBottom: 12, background: "#000" }}
              onLoadedMetadata={(e) => { if (progression?.position_video_secondes) e.target.currentTime = progression.position_video_secondes; }}
              onTimeUpdate={(e) => { if (Math.floor(e.target.currentTime) % 5 === 0) majProgressionVideo(e); }}
              onEnded={majProgressionVideo}
            />
            {progression?.statut === "completed" && <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700, marginBottom: 10 }}>✅ Cours terminé</div>}
          </>
        )}

        {cours.type === "texte" && (
          <>
            <div style={{ fontSize: 13, color: "#3D4A44", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 16 }}>{cours.contenu}</div>
            {progression?.statut === "completed" ? (
              <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700, marginBottom: 10 }}>✅ Cours terminé</div>
            ) : (
              <button onClick={marquerTermine} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
                {enCours ? "..." : "✅ J'ai terminé ce cours"}
              </button>
            )}
          </>
        )}

        {cours.type === "quiz" && <QuizPartenaire cours={cours} progression={progression} onChange={onChange} />}
        {cours.type === "reponse_libre" && <ReponseLibrePartenaire cours={cours} progression={progression} workspace={workspace} onChange={onChange} />}

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

function QuizPartenaire({ cours, progression, onChange }) {
  const [questions, setQuestions] = useState([]);
  const [reponses, setReponses] = useState({});
  const [resultat, setResultat] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // Ne renvoie jamais la bonne réponse au client — la sélection SQL exclut
    // volontairement la colonne bonne_reponse ici.
    supabase.from("ecole_quiz_questions").select("id, question, type, options, ordre").eq("cours_id", cours.id).order("ordre")
      .then(({ data }) => { setQuestions(data || []); setChargement(false); });
  }, [cours.id]);

  async function soumettre() {
    setEnCours(true);
    const { data } = await supabase.rpc("ecole_soumettre_quiz", { p_cours_id: cours.id, p_reponses: reponses });
    setEnCours(false);
    setResultat(data);
    if (data?.reussi) await onChange();
  }

  if (chargement) return <div style={{ fontSize: 12, color: "#8A9089" }}>Chargement du quiz...</div>;

  if (progression?.statut === "completed" && !resultat) {
    return <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700, marginBottom: 10 }}>✅ Quiz déjà réussi</div>;
  }

  return (
    <div>
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{i + 1}. {q.question}</div>
          {q.type === "qcm" ? (
            (q.options || []).map((opt) => (
              <label key={opt.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                <input type="radio" name={q.id} checked={reponses[q.id] === opt.id} onChange={() => setReponses((r) => ({ ...r, [q.id]: opt.id }))} />
                {opt.texte}
              </label>
            ))
          ) : (
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="radio" name={q.id} checked={reponses[q.id] === true} onChange={() => setReponses((r) => ({ ...r, [q.id]: true }))} /> Vrai</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="radio" name={q.id} checked={reponses[q.id] === false} onChange={() => setReponses((r) => ({ ...r, [q.id]: false }))} /> Faux</label>
            </div>
          )}
        </div>
      ))}

      {resultat && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: resultat.reussi ? "#EAF3DE" : "#FBEAEA", color: resultat.reussi ? "#1a7a3c" : "#D64933", fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
          {resultat.reussi ? "✅ Réussi" : "❌ Non réussi"} — {resultat.score}% ({resultat.nb_correctes}/{resultat.nb_questions}), seuil {resultat.seuil}%
        </div>
      )}

      <button onClick={soumettre} disabled={enCours || Object.keys(reponses).length < questions.length} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        {enCours ? "..." : resultat && !resultat.reussi ? "Réessayer" : "Soumettre mes réponses"}
      </button>
    </div>
  );
}

// Question ouverte corrigée par l'IA (§29). L'appel passe par admin-panel.js
// (service role) — le résultat est écrit côté serveur, jamais depuis ce
// composant : impossible pour le filleul de se déclarer "réussi" sans que
// l'IA ait vraiment évalué sa réponse.
function ReponseLibrePartenaire({ cours, progression, workspace, onChange }) {
  const [reponse, setReponse] = useState("");
  const [resultat, setResultat] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function soumettre() {
    if (!reponse.trim()) return;
    setEnCours(true);
    setErreur("");
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const reponseAPI = await fetch("/api/admin-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "evaluer_reponse_ecole", cours_id: cours.id, reponse_texte: reponse.trim(), workspace_id: workspace.id }),
      });
      const json = await reponseAPI.json();
      if (!reponseAPI.ok) { setErreur(json?.error || "Échec de l'évaluation."); setEnCours(false); return; }
      setResultat(json);
      if (json.reussi) await onChange();
    } catch (e) {
      setErreur("Erreur réseau, réessaie.");
    }
    setEnCours(false);
  }

  if (progression?.statut === "completed" && !resultat) {
    return <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700, marginBottom: 10 }}>✅ Déjà validé</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{cours.contenu}</div>
      <textarea
        placeholder="Écris ta réponse ici..."
        value={reponse}
        onChange={(e) => setReponse(e.target.value)}
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13, resize: "vertical", marginBottom: 10 }}
      />
      {erreur && <div style={{ fontSize: 11.5, color: "#D64933", marginBottom: 10 }}>{erreur}</div>}
      {resultat && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: resultat.reussi ? "#EAF3DE" : "#FBEAEA", color: resultat.reussi ? "#1a7a3c" : "#D64933", fontSize: 12.5, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{resultat.reussi ? "✅ Réussi" : "❌ À revoir"}</div>
          <div>{resultat.feedback}</div>
        </div>
      )}
      <button onClick={soumettre} disabled={enCours || !reponse.trim()} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        {enCours ? "Évaluation en cours..." : resultat && !resultat.reussi ? "Réessayer" : "Soumettre ma réponse"}
      </button>
    </div>
  );
}
