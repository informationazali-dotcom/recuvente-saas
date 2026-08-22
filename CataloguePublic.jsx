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
  const [produitOuvert, setProduitOuvert] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [form, setForm] = useState({ client: "", tel: "", zone: "" });
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [lienCopie, setLienCopie] = useState(false);

  function chargerPixelFacebook(pixelId) {
    if (!pixelId || window.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
  }

  function trackEvenement(nom, params) {
    if (window.fbq) window.fbq("track", nom, params);
  }

  useEffect(() => {
    supabase.rpc("catalogue_public", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce catalogue est introuvable ou vide.");
        return;
      }
      setEntreprise({
        nom: data[0].entreprise_nom,
        devise: data[0].devise,
        logo: data[0].logo_url,
        banniere: data[0].banniere_url,
        couleur: data[0].couleur_marque || "#1a7a3c",
        description: data[0].description_boutique,
      });
      chargerPixelFacebook(data[0].facebook_pixel_id);
      const listeProduits = data.filter((p) => p.produit_nom);
      setProduits(listeProduits);

      const idProduitDansUrl = new URLSearchParams(window.location.search).get("produit");
      if (idProduitDansUrl) {
        const trouve = listeProduits.find((p) => p.produit_id === idProduitDansUrl);
        if (trouve) {
          setProduitOuvert(trouve);
          setForm({ client: "", tel: "", zone: "" });
        }
      }
    });
  }, [workspaceId]);

  function ouvrirProduit(p) {
    trackEvenement("ViewContent", { content_ids: [p.produit_id], content_name: p.produit_nom, value: Number(p.prix_vente), currency: entreprise?.devise || "XOF" });
    setProduitOuvert(p);
    setAfficherFormulaire(false);
    setForm({ client: "", tel: "", zone: "" });
    setEnvoye(false);
    setErreurEnvoi("");
    const url = new URL(window.location.href);
    url.searchParams.set("produit", p.produit_id);
    window.history.pushState({}, "", url);
  }

  function fermerProduit() {
    setProduitOuvert(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
  }

  async function envoyerCommande() {
    if (!form.client.trim() || !form.tel.trim() || !form.zone.trim()) {
      setErreurEnvoi("Merci de renseigner ton nom, ton téléphone et ta ville/quartier.");
      return;
    }
    setEnvoi(true);
    setErreurEnvoi("");
    const items = [{
      produit_id: produitOuvert.produit_id,
      produit_nom: produitOuvert.produit_nom,
      quantite: 1,
      prix_unitaire: Number(produitOuvert.prix_vente),
    }];
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
    trackEvenement("Purchase", {
      content_ids: [produitOuvert.produit_id],
      value: Number(produitOuvert.prix_vente),
      currency: entreprise?.devise || "XOF",
    });
    setEnvoye(true);
  }

  const couleur = entreprise?.couleur || "#1a7a3c";

  if (entreprise === undefined && !erreur) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A9089", fontFamily: "sans-serif" }}>
        Chargement…
      </div>
    );
  }

  if (erreur) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN FICHE PRODUIT (commande directe) =====
  if (produitOuvert) {
    return (
      <div style={{ minHeight: "100vh", background: "white", fontFamily: "sans-serif" }}>
        <div style={{ position: "relative" }}>
          {produitOuvert.photo_url ? (
            <img
              src={produitOuvert.photo_url}
              alt={produitOuvert.produit_nom}
              style={{ width: "100%", height: 260, objectFit: "cover", background: "#EEF0EA", display: "block" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div style={{ width: "100%", height: 260, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>📦</div>
          )}
          <button
            onClick={fermerProduit}
            style={{ position: "absolute", top: 16, left: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
          >
            ←
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setLienCopie(true);
              setTimeout(() => setLienCopie(false), 2000);
            }}
            style={{ position: "absolute", top: 16, right: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 16, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
          >
            {lienCopie ? "✅" : "🔗"}
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: "22px 18px 140px" }}>
          <div style={{ fontWeight: 700, fontSize: 21 }}>{produitOuvert.produit_nom}</div>
          <div style={{ fontWeight: 700, fontSize: 24, color: couleur, marginTop: 6, marginBottom: 18 }}>
            {Number(produitOuvert.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
          </div>

          {produitOuvert.produit_description ? (
            <div
              style={{ fontSize: 14.5, color: "#16231F", lineHeight: 1.65, marginBottom: 26 }}
              dangerouslySetInnerHTML={{ __html: produitOuvert.produit_description }}
            />
          ) : (
            <div style={{ fontSize: 13, color: "#8A9089", fontStyle: "italic", marginBottom: 26 }}>Aucune description disponible.</div>
          )}

          {envoye && (
            <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 14, padding: 22, textAlign: "center" }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: "#3B6D11" }}>Commande envoyée !</div>
              <div style={{ fontSize: 13, color: "#3B6D11" }}>{entreprise.nom} va te contacter au {form.tel} pour confirmer.</div>
            </div>
          )}
        </div>

        {!envoye && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "14px 18px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)" }}>
            <button
              onClick={() => setAfficherFormulaire(true)}
              style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              {`Commander — ${Number(produitOuvert.prix_vente).toLocaleString("fr-FR")} ${entreprise.devise}`}
            </button>
          </div>
        )}

        {afficherFormulaire && !envoye && (
          <div
            onClick={() => setAfficherFormulaire(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "white", width: "100%", borderRadius: "18px 18px 0 0", padding: "20px 18px 24px", maxHeight: "80vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Tes coordonnées</div>
                <button onClick={() => setAfficherFormulaire(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
                Pour qu'on puisse te contacter et te livrer.
              </div>

              <input
                placeholder="Ton nom"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                autoFocus
                style={inputStyle}
              />
              <input
                placeholder="Ton numéro de téléphone"
                value={form.tel}
                onChange={(e) => setForm({ ...form, tel: e.target.value })}
                style={inputStyle}
              />
              <input
                placeholder="Ta ville et ton quartier"
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                style={inputStyle}
              />
              {erreurEnvoi && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreurEnvoi}</div>}

              <button
                onClick={envoyerCommande}
                disabled={envoi || !form.client.trim() || !form.tel.trim() || !form.zone.trim()}
                style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: envoi ? "default" : "pointer", opacity: (envoi || !form.client.trim() || !form.tel.trim() || !form.zone.trim()) ? 0.5 : 1, marginTop: 4 }}
              >
                {envoi ? "Envoi..." : "Confirmer la commande"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ÉCRAN CATALOGUE (liste des produits) =====
  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
      {entreprise.banniere ? (
        <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden" }}>
          <img src={entreprise.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.35))" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: 90, background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }} />
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: entreprise.logo ? -36 : 20, marginBottom: 20, position: "relative", zIndex: 1 }}>
          {entreprise.logo ? (
            <img
              src={entreprise.logo}
              alt={entreprise.nom}
              style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", border: "3px solid white", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", background: "white", flexShrink: 0 }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : null}
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 21, color: "#16231F" }}>{entreprise.nom}</div>
            {entreprise.description && <div style={{ fontSize: 12.5, color: "#6B7168", marginTop: 2 }}>{entreprise.description}</div>}
          </div>
        </div>

        {produits.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, marginTop: 40, paddingBottom: 40 }}>
            Aucun produit disponible pour le moment.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingBottom: 30 }}>
          {produits.map((p) => (
            <button
              key={p.produit_id}
              onClick={() => ouvrirProduit(p)}
              style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left" }}
            >
              {p.photo_url ? (
                <img
                  src={p.photo_url}
                  alt={p.produit_nom}
                  style={{ width: "100%", height: 120, objectFit: "cover", background: "#EEF0EA", display: "block" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                <div style={{ width: "100%", height: 120, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📦</div>
              )}
              <div style={{ padding: "10px 12px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>
                  {Number(p.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: "#8A9089", paddingBottom: 24 }}>
          Propulsé par RecuVente
        </div>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" };
