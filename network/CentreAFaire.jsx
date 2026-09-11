import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Centre "À faire" (§16, §30) — rassemble ce qui a vraiment besoin d'une action,
// avec des chiffres réels calculés depuis Supabase. Jamais de statistique inventée :
// si une donnée n'est pas calculable proprement, l'item est simplement absent plutôt
// que remplacé par un faux zéro ou un chiffre approximatif.
export default function CentreAFaire({ workspace, onNaviguer }) {
  const [actions, setActions] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    async function charger() {
      setChargement(true);
      const deuxJours = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const quatorzeJours = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [paiements, partenaires, prospectsAbandonnes, filleulsActifs, ventesRecentes] = await Promise.all([
        supabase.from("recrutement_commandes_pack").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id).not("statut_paiement", "in", "(confirme,refuse)"),
        supabase.from("recrutement_commandes_pack").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id).eq("statut_partenaire", "cree").neq("statut_activation", "active"),
        supabase.from("filleuls_prospects").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id).eq("parcours_statut", "candidature_debutee").lt("created_at", deuxJours),
        supabase.from("filleuls").select("id").eq("workspace_id", workspace.id).eq("statut", "actif"),
        supabase.from("filleuls_commissions").select("filleul_id").eq("workspace_id", workspace.id).gte("created_at", quatorzeJours),
      ]);

      const idsActifs = new Set((filleulsActifs.data || []).map((f) => f.id));
      const idsAvecVenteRecente = new Set((ventesRecentes.data || []).map((c) => c.filleul_id));
      const nbInactifs = [...idsActifs].filter((id) => !idsAvecVenteRecente.has(id)).length;

      setActions([
        { cle: "recrutement", icone: "💳", texte: "paiement(s) à vérifier", n: paiements.count || 0, vue: "recrutement" },
        { cle: "recrutement2", icone: "🟢", texte: "partenaire(s) prêt(s) à activer", n: partenaires.count || 0, vue: "recrutement" },
        { cle: "reseau", icone: "🎯", texte: "candidature(s) abandonnée(s) à relancer", n: prospectsAbandonnes.count || 0, vue: "reseau" },
        { cle: "reseau2", icone: "😴", texte: `filleul(s) actif(s) sans vente depuis 14 jours`, n: nbInactifs, vue: "reseau" },
      ]);
      setChargement(false);
    }
    charger();
  }, [workspace.id]);

  if (chargement || !actions) return null;
  const total = actions.reduce((s, a) => s + a.n, 0);
  const actionsAvecItems = actions.filter((a) => a.n > 0);

  if (total === 0) {
    return (
      <div style={{ background: "#EAF3DE", border: "1px solid #d5e8c2", borderRadius: 14, padding: "14px 18px", marginBottom: 16, fontSize: 12.5, color: "#1a7a3c", fontWeight: 700 }}>
        ✅ Rien n'attend votre attention pour l'instant.
      </div>
    );
  }

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>
        🔔 {total} action{total > 1 ? "s" : ""} nécessite{total > 1 ? "nt" : ""} votre attention
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {actionsAvecItems.map((a) => (
          <div
            key={a.cle}
            onClick={() => {
              if (a.cle === "reseau2") { try { sessionStorage.setItem("rv_filtre_filleuls_initial", "inactifs"); } catch (_) {} }
              onNaviguer?.(a.vue);
            }}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 9, background: "#FFF8E7", cursor: onNaviguer ? "pointer" : "default", fontSize: 12 }}
          >
            <span>{a.icone} {a.n} {a.texte}</span>
            {onNaviguer && <span style={{ color: "#8A6412", fontSize: 11 }}>→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
