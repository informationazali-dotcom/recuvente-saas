import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  digits = digits.replace(/^0/, "");
  return "225" + digits;
}

export default function CataloguePublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [produits, setProduits] = useState([]);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    supabase.rpc("catalogue_public", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce catalogue est introuvable ou vide.");
        return;
      }
      setEntreprise({ nom: data[0].entreprise_nom, devise: data[0].devise, whatsapp: data[0].whatsapp_number });
      setProduits(data.filter((p) => p.produit_nom));
    });
  }, [workspaceId]);

  function lienWhatsApp(produit) {
    const numero = cleanPhoneForWhatsApp(entreprise.whatsapp);
    const texte = `Bonjour 👋, je veux commander : ${produit.produit_nom} à ${Number(produit.prix_vente).toLocaleString("fr-FR")} ${entreprise.devise}`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texte)}`;
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
        {entreprise === undefined && !erreur && (
          <div style={{ textAlign: "center", color: "#8A9089", marginTop: 60 }}>Chargement…</div>
        )}

        {erreur && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center", marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
          </div>
        )}

        {entreprise && !erreur && (
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 21 }}>{entreprise.nom}</div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 2 }}>Clique sur un produit pour commander via WhatsApp</div>
            </div>

            {produits.length === 0 && (
              <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, marginTop: 40 }}>
                Aucun produit disponible pour le moment.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {produits.map((p, i) => (
                <a
                  key={i}
                  href={lienWhatsApp(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    background: "white",
                    border: "1px solid #ECE8DC",
                    borderRadius: 14,
                    padding: 12,
                    textDecoration: "none",
                    color: "#16231F",
                  }}
                >
                  {p.photo_url ? (
                    <img
                      src={p.photo_url}
                      alt={p.produit_nom}
                      style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#EEF0EA" }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 10, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                      📦
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.produit_nom}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a7a3c", marginTop: 2 }}>
                      {Number(p.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
                    </div>
                  </div>
                  <div style={{ background: "#1a7a3c", color: "white", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    Commander
                  </div>
                </a>
              ))}
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: "#8A9089", marginTop: 26 }}>
              Propulsé par RecuVente
            </div>
          </>
        )}
      </div>
    </div>
  );
}
