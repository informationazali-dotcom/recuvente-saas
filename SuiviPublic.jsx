import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ETAPES = [
  { key: "en_cours", label: "Commande reçue" },
  { key: "confirmee", label: "Livrée" },
];

export default function SuiviPublic({ commandeId }) {
  const [commande, setCommande] = useState(undefined);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    supabase.rpc("suivi_commande_public", { p_id: commandeId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) setErreur("Commande introuvable.");
      else setCommande(data[0]);
    });
  }, [commandeId]);

  const etapeActuelle = commande?.statut === "confirmee" ? 1 : commande?.statut === "echouee" ? -1 : 0;

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {commande === undefined && !erreur && <div style={{ textAlign: "center", color: "#8A9089" }}>Chargement…</div>}

        {erreur && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
          </div>
        )}

        {commande && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase" }}>{commande.workspace_nom}</div>
            <div style={{ fontSize: 13, color: "#6B7168", marginTop: 6 }}>Bonjour {commande.client?.split(" ")[0]}</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{commande.produit}</div>
            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 22, color: "#1a7a3c", marginTop: 6 }}>
              {Number(commande.montant).toLocaleString("fr-FR")} {commande.devise}
            </div>

            {etapeActuelle === -1 ? (
              <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: 14, marginTop: 20, textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>⚠️</div>
                <div style={{ color: "#D64933", fontWeight: 600, fontSize: 13.5 }}>
                  Nous n'avons pas pu finaliser la livraison. Notre équipe va vous recontacter.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column" }}>
                {ETAPES.map((etape, i) => {
                  const atteint = i <= etapeActuelle;
                  return (
                    <div key={etape.key} style={{ display: "flex", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: atteint ? "#1a7a3c" : "#ECE8DC", color: atteint ? "white" : "#8A9089", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {atteint ? "✓" : i + 1}
                        </div>
                        {i === 0 && <div style={{ width: 2, flex: 1, minHeight: 30, background: atteint && i < etapeActuelle ? "#1a7a3c" : "#ECE8DC", marginTop: 2 }} />}
                      </div>
                      <div style={{ paddingBottom: 26 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: atteint ? "#16231F" : "#8A9089" }}>{etape.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
