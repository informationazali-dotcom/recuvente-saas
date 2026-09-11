import React, { useState } from "react";
import { supabase } from "../supabaseClient";

// Recherche globale (§25) — filleuls, prospects et candidatures en une seule
// recherche, jamais construite jusqu'ici (chaque écran avait sa propre
// recherche locale, limitée à ses propres données).
export default function RechercheGlobale({ workspace, onNaviguer }) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState(null);
  const [chargement, setChargement] = useState(false);
  let timeoutRef = React.useRef(null);

  function onChangeQ(valeur) {
    setQ(valeur);
    clearTimeout(timeoutRef.current);
    if (!valeur.trim() || valeur.trim().length < 2) { setResultats(null); return; }
    timeoutRef.current = setTimeout(() => rechercher(valeur.trim()), 350);
  }

  async function rechercher(valeur) {
    setChargement(true);
    const motif = `%${valeur}%`;
    const [filleuls, prospects, candidatures] = await Promise.all([
      supabase.from("filleuls").select("id, nom, code, telephone").eq("workspace_id", workspace.id).or(`nom.ilike.${motif},code.ilike.${motif},telephone.ilike.${motif}`).limit(6),
      supabase.from("filleuls_prospects").select("id, nom, telephone, parcours_statut").eq("workspace_id", workspace.id).or(`nom.ilike.${motif},telephone.ilike.${motif}`).limit(6),
      supabase.from("recrutement_candidatures").select("id, nom, telephone").eq("workspace_id", workspace.id).or(`nom.ilike.${motif},telephone.ilike.${motif}`).limit(6),
    ]);
    setResultats({
      filleuls: filleuls.data || [],
      prospects: prospects.data || [],
      candidatures: candidatures.data || [],
    });
    setChargement(false);
  }

  function allerA(vue) {
    setOuvert(false);
    setQ("");
    setResultats(null);
    onNaviguer?.(vue);
  }

  const total = resultats ? resultats.filleuls.length + resultats.prospects.length + resultats.candidatures.length : 0;

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <input
        placeholder="🔍 Rechercher un filleul, un prospect, une candidature..."
        value={q}
        onFocus={() => setOuvert(true)}
        onChange={(e) => onChangeQ(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 13 }}
      />

      {ouvert && q.trim().length >= 2 && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOuvert(false)} />
          <div style={{ position: "absolute", top: "110%", left: 0, right: 0, background: "white", border: "1px solid #ECE8DC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, maxHeight: 360, overflowY: "auto" }}>
            {chargement && <div style={{ padding: 14, fontSize: 12, color: "#8A9089" }}>Recherche...</div>}
            {!chargement && total === 0 && <div style={{ padding: 14, fontSize: 12, color: "#8A9089" }}>Aucun résultat pour "{q}".</div>}

            {!chargement && resultats?.filleuls.length > 0 && (
              <div>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: "#8A9089", textTransform: "uppercase" }}>Filleuls</div>
                {resultats.filleuls.map((f) => (
                  <div key={f.id} onClick={() => allerA("reseau")} style={{ padding: "9px 14px", fontSize: 12.5, cursor: "pointer", borderBottom: "1px solid #F3F1EA" }}>
                    👤 <strong>{f.nom}</strong> <span style={{ color: "#8A9089" }}>· {f.code}{f.telephone ? ` · ${f.telephone}` : ""}</span>
                  </div>
                ))}
              </div>
            )}

            {!chargement && resultats?.prospects.length > 0 && (
              <div>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: "#8A9089", textTransform: "uppercase" }}>Prospects</div>
                {resultats.prospects.map((p) => (
                  <div key={p.id} onClick={() => allerA("reseau")} style={{ padding: "9px 14px", fontSize: 12.5, cursor: "pointer", borderBottom: "1px solid #F3F1EA" }}>
                    🎯 <strong>{p.nom}</strong> <span style={{ color: "#8A9089" }}>· {p.telephone || "—"} · {p.parcours_statut || "nouveau"}</span>
                  </div>
                ))}
              </div>
            )}

            {!chargement && resultats?.candidatures.length > 0 && (
              <div>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 800, color: "#8A9089", textTransform: "uppercase" }}>Candidatures</div>
                {resultats.candidatures.map((c) => (
                  <div key={c.id} onClick={() => allerA("recrutement")} style={{ padding: "9px 14px", fontSize: 12.5, cursor: "pointer", borderBottom: "1px solid #F3F1EA" }}>
                    📋 <strong>{c.nom}</strong> <span style={{ color: "#8A9089" }}>· {c.telephone || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
