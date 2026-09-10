import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// "Prochaine action" côté filleul (§15, §31) — miroir du CentreAFaire (côté
// propriétaire) mais pour son propre pilotage. Une seule action mise en avant
// à la fois, la plus pertinente, jamais une liste de statistiques inventées.
export default function ProchaineActionPartenaire({ filleul, workspace }) {
  const [action, setAction] = useState(undefined);

  useEffect(() => {
    async function calculer() {
      // 1. Un cours débloqué mais pas terminé ?
      const [{ data: niveaux }, { data: cours }, { data: progression }] = await Promise.all([
        supabase.from("ecole_niveaux").select("id").eq("workspace_id", workspace.id).eq("actif", true).order("ordre"),
        supabase.from("ecole_cours").select("id, titre, cours_prealable_id, niveau_id").eq("workspace_id", workspace.id).eq("actif", true).order("ordre"),
        supabase.from("ecole_progression").select("cours_id, statut").eq("filleul_id", filleul.id),
      ]);
      const progMap = Object.fromEntries((progression || []).map((p) => [p.cours_id, p.statut]));
      const ordreNiveaux = Object.fromEntries((niveaux || []).map((n, i) => [n.id, i]));
      const coursTries = [...(cours || [])].sort((a, b) => (ordreNiveaux[a.niveau_id] ?? 99) - (ordreNiveaux[b.niveau_id] ?? 99));
      const prochainCours = coursTries.find((c) => {
        const debloque = !c.cours_prealable_id || progMap[c.cours_prealable_id] === "completed";
        return debloque && progMap[c.id] !== "completed";
      });

      if (prochainCours) {
        setAction({ type: "cours", texte: `Votre prochaine étape : terminer le cours "${prochainCours.titre}".`, icone: "🎓" });
        return;
      }

      // 2. Des prospects personnels à relancer ?
      const deuxJours = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { count: nbProspects } = await supabase.from("filleuls_prospects").select("id", { count: "exact", head: true })
        .eq("prospecte_par_filleul_id", filleul.id).eq("parcours_statut", "candidature_debutee").lt("created_at", deuxJours);
      if (nbProspects > 0) {
        setAction({ type: "prospects", texte: `${nbProspects} prospect${nbProspects > 1 ? "s" : ""} ${nbProspects > 1 ? "nécessitent" : "nécessite"} une relance.`, icone: "🎯" });
        return;
      }

      // 3. Une commission disponible mais jamais payée ?
      const { data: commissions } = await supabase.from("filleuls_commissions").select("montant_commission, statut").eq("filleul_id", filleul.id).in("statut", ["validated", "available"]);
      const total = (commissions || []).reduce((s, c) => s + Number(c.montant_commission || 0), 0);
      if (total > 0) {
        setAction({ type: "commission", texte: `Vous avez une commission disponible. Parlez-en au responsable du réseau si elle tarde à être versée.`, icone: "💰" });
        return;
      }

      setAction(null);
    }
    calculer();
  }, [filleul.id, workspace.id]);

  if (action === undefined) return null;
  if (action === null) return null;

  return (
    <div style={{ background: "linear-gradient(135deg,#0d2417,#1a4a2e)", color: "white", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 22 }}>{action.icone}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{action.texte}</div>
    </div>
  );
}
