import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Objectif du mois (§30, §48) — cible réelle définie par l'admin, progression
// calculée sur des données réelles uniquement (ventes ou activations du mois
// en cours). Jamais un chiffre inventé — si aucun objectif n'est défini,
// le widget propose simplement d'en créer un plutôt que d'afficher un faux 0%.
export default function ObjectifDuMois({ workspace, peutGerer }) {
  const [objectifs, setObjectifs] = useState(null);
  const [progres, setProgres] = useState({});
  const [edition, setEdition] = useState(null); // 'ventes' | 'recrutement' | null

  const premierDuMois = new Date();
  premierDuMois.setDate(1);
  premierDuMois.setHours(0, 0, 0, 0);
  const moisISO = premierDuMois.toISOString().slice(0, 10);
  const debutMoisTimestamp = premierDuMois.toISOString();

  async function supprimer(cle, id) {
    if (!window.confirm("Supprimer cet objectif ?")) return;
    await supabase.from("objectifs_reseau").delete().eq("id", id);
    await charger();
  }

  async function charger() {
    const { data } = await supabase.from("objectifs_reseau").select("*").eq("workspace_id", workspace.id).eq("mois", moisISO);
    const map = {};
    (data || []).forEach((o) => { map[o.type] = o; });
    setObjectifs(map);

    const [ventes, activations] = await Promise.all([
      supabase.from("filleuls_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).gte("created_at", debutMoisTimestamp),
      supabase.from("recrutement_commandes_pack").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("statut_activation", "active").gte("activation_at", debutMoisTimestamp),
    ]);
    setProgres({ ventes: ventes.count || 0, recrutement: activations.count || 0 });
  }
  useEffect(() => { charger(); }, [workspace.id]);

  if (!objectifs) return null;

  const items = [
    { cle: "ventes", icone: "🛍️", label: "Ventes ce mois-ci" },
    { cle: "recrutement", icone: "🤝", label: "Nouveaux partenaires ce mois-ci" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginBottom: 16 }}>
      {items.map((item) => {
        const objectif = objectifs[item.cle];
        const valeur = progres[item.cle] || 0;
        return (
          <div key={item.cle} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>{item.icone} {item.label}</div>
            {objectif ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: valeur >= objectif.cible ? "#1a7a3c" : "#16231F" }}>{valeur}</div>
                  <div style={{ fontSize: 11, color: "#8A9089" }}>objectif : {objectif.cible}</div>
                </div>
                <div style={{ width: "100%", height: 7, background: "#F3F1EA", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, Math.round((valeur / objectif.cible) * 100))}%`, height: "100%", background: valeur >= objectif.cible ? "#1a7a3c" : "#6b3fd4" }} />
                </div>
                {valeur >= objectif.cible && <div style={{ fontSize: 10.5, color: "#1a7a3c", fontWeight: 700, marginTop: 6 }}>🎉 Objectif atteint !</div>}
                {peutGerer && (
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => setEdition(item.cle)} style={{ background: "none", border: "none", color: "#8A9089", fontSize: 10, cursor: "pointer" }}>Modifier</button>
                    <button onClick={() => supprimer(item.cle, objectif.id)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 10, cursor: "pointer" }}>Supprimer</button>
                  </div>
                )}
              </>
            ) : peutGerer ? (
              <button onClick={() => setEdition(item.cle)} style={{ width: "100%", background: "#F7FAF7", border: "1px dashed #DDD8CC", borderRadius: 9, padding: "9px 0", fontSize: 11.5, color: "#6B7168", cursor: "pointer" }}>
                + Définir un objectif
              </button>
            ) : (
              <div style={{ fontSize: 11, color: "#8A9089" }}>Aucun objectif défini pour l'instant.</div>
            )}
          </div>
        );
      })}

      {edition && (
        <EditionObjectifModal
          workspace={workspace}
          type={edition}
          mois={moisISO}
          objectifActuel={objectifs[edition]}
          onClose={() => setEdition(null)}
          onEnregistre={async () => { setEdition(null); await charger(); }}
        />
      )}
    </div>
  );
}

function EditionObjectifModal({ workspace, type, mois, objectifActuel, onClose, onEnregistre }) {
  const [cible, setCible] = useState(objectifActuel?.cible ? String(objectifActuel.cible) : "");
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    if (!cible || Number(cible) <= 0) return;
    setEnCours(true);
    await supabase.from("objectifs_reseau").upsert(
      { workspace_id: workspace.id, mois, type, cible: Number(cible), updated_at: new Date().toISOString() },
      { onConflict: "workspace_id,mois,type" }
    );
    setEnCours(false);
    onEnregistre();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 320 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{type === "ventes" ? "🛍️ Objectif ventes" : "🤝 Objectif recrutement"}</div>
        <input type="number" placeholder="Cible ce mois-ci" value={cible} onChange={(e) => setCible(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 12, fontSize: 14 }} autoFocus />
        <button onClick={enregistrer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : "Enregistrer"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}
