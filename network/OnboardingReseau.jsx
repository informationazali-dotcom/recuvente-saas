import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Onboarding guidé (§24) pour le secteur Marketing de réseau. Volontairement
// une checklist compacte plutôt qu'un tunnel plein écran séparé — s'intègre
// dans "🟣 Mon Réseau" sans casser la navigation existante, et disparaît
// d'elle-même une fois les étapes réellement complétées (jamais une
// simple case à cocher manuellement — vérifié sur les vraies données).
export default function OnboardingReseau({ workspace, produits, filleuls, onNaviguer }) {
  const [etat, setEtat] = useState(null);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    async function verifier() {
      const [{ count: nbPacks }, produitsAvecCommission] = await Promise.all([
        supabase.from("recrutement_packs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
        Promise.resolve((produits || []).filter((p) => p.commission_type && p.commission_valeur != null).length),
      ]);
      setEtat({
        produit: (produits || []).length > 0,
        commission: produitsAvecCommission > 0,
        pack: (nbPacks || 0) > 0,
        filleul: (filleuls || []).length > 0,
      });
    }
    verifier();
  }, [workspace.id, produits, filleuls]);

  if (!etat || masque) return null;
  const etapes = [
    { cle: "produit", texte: "Ajouter au moins un produit à votre boutique", vue: "produits_vue" },
    { cle: "commission", texte: "Configurer la commission d'un produit", vue: "reseau" },
    { cle: "pack", texte: "Créer votre premier pack d'adhésion", vue: "recrutement" },
    { cle: "filleul", texte: "Créer votre premier filleul", vue: "reseau" },
  ];
  const restantes = etapes.filter((e) => !etat[e.cle]);
  if (restantes.length === 0) return null;

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F" }}>🚀 Pour démarrer votre réseau</div>
        <button onClick={() => setMasque(true)} style={{ background: "none", border: "none", color: "#8A9089", fontSize: 11, cursor: "pointer" }}>Masquer</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {etapes.map((e) => (
          <div
            key={e.cle}
            onClick={() => !etat[e.cle] && onNaviguer?.(e.vue)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: etat[e.cle] ? "#F7FAF7" : "#FFF8E7", cursor: etat[e.cle] ? "default" : "pointer" }}
          >
            <div style={{ fontSize: 15 }}>{etat[e.cle] ? "✅" : "⚪"}</div>
            <div style={{ fontSize: 12, color: etat[e.cle] ? "#8A9089" : "#16231F", textDecoration: etat[e.cle] ? "line-through" : "none", flex: 1 }}>{e.texte}</div>
            {!etat[e.cle] && <div style={{ fontSize: 11, color: "#8A6412" }}>→</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
