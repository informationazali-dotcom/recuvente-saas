import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function CataloguePublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [produits, setProduits] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [panier, setPanier] = useState({}); // { produit_id: quantite }
  const [vuePanier, setVuePanier] = useState(false);
  const [form, setForm] = useState({ client: "", tel: "", zone: "" });
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");

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

  function ajouterAuPanier(produitId) {
    setPanier((p) => ({ ...p, [produitId]: (p[produitId] || 0) + 1 }));
  }

  function retirerDuPanier(produitId) {
    setPanier((p) => {
      const copie = { ...p };
      if (copie[produitId] > 1) copie[produitId] -= 1;
      else delete copie[produitId];
      return copie;
    });
  }

  const articlesPanier = Object.entries(panier)
    .map(([produitId, quantite]) => {
      const produit = produits.find((p) => p.produit_id === produitId);
      return produit ? { ...produit, quantite } : null;
    })
    .filter(Boolean);

  const totalArticles = articlesPanier.reduce((s, a) => s + a.quantite, 0);
  const totalMontant = articlesPanier.reduce((s, a) => s + a.quantite * Number(a.prix_vente), 0);

  async function envoyerCommande() {
    if (!form.client.trim() || !form.tel.trim()) {
      setErreurEnvoi("Merci de renseigner ton nom et ton téléphone.");
      return;
    }
    setEnvoi(true);
    setErreurEnvoi("");
    const items = articlesPanier.map((a) => ({
      produit_id: a.produit_id,
      produit_nom: a.produit_nom,
      quantite: a.quantite,
      prix_unitaire: Number(a.prix_vente),
    }));
    const { data, error } = await supabase.rpc("creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: form.zone,
      p_items: items,
    });
    setEnvoi(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoi(resultat?.message || "Une erreur est survenue, réessaie.");
      return;
    }
    setEnvoye(true);
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", padding: "24px 16px 90px" }}>
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

        {entreprise && !erreur && envoye && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, textAlign: "center", marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Commande envoyée !</div>
            <div style={{ color: "#6B7168", fontSize: 13.5, lineHeight: 1.5 }}>
              {entreprise.nom} va te contacter au {form.tel} pour confirmer ta commande.
            </div>
          </div>
        )}

        {entreprise && !erreur && !envoye && !vuePanier && (
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 21 }}>{entreprise.nom}</div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginTop: 2 }}>Ajoute des produits à ton panier, puis commande en une fois</div>
            </div>

            {produits.length === 0 && (
              <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, marginTop: 40 }}>
                Aucun produit disponible pour le moment.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {produits.map((p) => (
                <div
                  key={p.produit_id}
                  style={{ display: "flex", alignItems: "center", gap: 14, background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 12 }}
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
                  {panier[p.produit_id] ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => retirerDuPanier(p.produit_id)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #DDD8CC", background: "white", fontSize: 15, cursor: "pointer" }}>−</button>
                      <div style={{ fontWeight: 700, fontSize: 14, minWidth: 14, textAlign: "center" }}>{panier[p.produit_id]}</div>
                      <button onClick={() => ajouterAuPanier(p.produit_id)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#1a7a3c", color: "white", fontSize: 15, cursor: "pointer" }}>+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => ajouterAuPanier(p.produit_id)}
                      style={{ background: "#1a7a3c", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0 }}
                    >
                      Ajouter
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: "#8A9089", marginTop: 26 }}>
              Propulsé par RecuVente
            </div>
          </>
        )}

        {entreprise && !erreur && !envoye && vuePanier && (
          <>
            <button onClick={() => setVuePanier(false)} style={{ background: "none", border: "none", color: "#1a7a3c", fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}>
              ← Retour au catalogue
            </button>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 14 }}>Ton panier</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {articlesPanier.map((a) => (
                <div key={a.produit_id} style={{ display: "flex", justifyContent: "space-between", background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.produit_nom}</div>
                    <div style={{ fontSize: 12, color: "#8A9089" }}>{a.quantite} × {Number(a.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{(a.quantite * Number(a.prix_vente)).toLocaleString("fr-FR")} {entreprise.devise}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginBottom: 20, padding: "0 4px" }}>
              <div>Total</div>
              <div>{totalMontant.toLocaleString("fr-FR")} {entreprise.devise}</div>
            </div>

            <input
              placeholder="Ton nom"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Ton numéro de téléphone"
              value={form.tel}
              onChange={(e) => setForm({ ...form, tel: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Quartier / adresse de livraison (optionnel)"
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              style={inputStyle}
            />

            {erreurEnvoi && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreurEnvoi}</div>}

            <button
              onClick={envoyerCommande}
              disabled={envoi}
              style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14.5, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
            >
              {envoi ? "Envoi..." : "Confirmer la commande"}
            </button>
          </>
        )}
      </div>

      {totalArticles > 0 && !vuePanier && !envoye && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a7a3c", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 -4px 16px rgba(0,0,0,0.12)" }}>
          <div style={{ color: "white", fontWeight: 600, fontSize: 13.5 }}>
            {totalArticles} article{totalArticles > 1 ? "s" : ""} · {totalMontant.toLocaleString("fr-FR")} {entreprise?.devise}
          </div>
          <button
            onClick={() => setVuePanier(true)}
            style={{ background: "white", color: "#1a7a3c", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Voir le panier →
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" };
