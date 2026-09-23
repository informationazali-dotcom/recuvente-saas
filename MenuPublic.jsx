import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function cleanPhoneForWhatsApp(tel) {
  const chiffres = String(tel || "").replace(/\D/g, "");
  if (chiffres.startsWith("225")) return chiffres;
  if (chiffres.startsWith("0")) return "225" + chiffres.slice(1);
  return chiffres;
}

// Menu public d'un restaurant RecuVente, pensé pour être ouvert via un QR code posé sur la
// table (?menu=<slug-boutique>&table=<numéro>). Le client compose sa commande, puis l'envoie
// directement par WhatsApp au restaurant — aucun compte, aucun paiement en ligne nécessaire ici.
export default function MenuPublic({ slug, table }) {
  const [donnees, setDonnees] = useState(undefined);
  const [erreur, setErreur] = useState(null);
  const [quantites, setQuantites] = useState({});
  const [panierOuvert, setPanierOuvert] = useState(false);

  useEffect(() => {
    document.title = "Menu — RecuVente";
    supabase.rpc("menu_public", { p_slug: slug }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce menu est introuvable ou n'est pas encore disponible.");
        return;
      }
      const premiere = data[0];
      document.title = `Menu — ${premiere.nom_boutique}`;
      setDonnees({
        nomBoutique: premiere.nom_boutique,
        whatsapp: premiere.whatsapp_number,
        devise: premiere.devise === "XOF" || premiere.devise === "XAF" ? "F CFA" : premiere.devise,
        plats: data
          .filter((p) => p.plat_disponible && p.plat_id)
          .map((p) => ({ id: p.plat_id, nom: p.plat_nom, categorie: p.plat_categorie || "Menu", prix: Number(p.plat_prix) || 0, description: p.plat_description || "" })),
      });
    }).catch(() => setErreur("Impossible de charger le menu pour le moment."));
  }, [slug]);

  const categories = useMemo(() => [...new Set((donnees?.plats || []).map((p) => p.categorie))], [donnees]);

  function ajusterQuantite(platId, delta) {
    setQuantites((q) => {
      const nouvelle = Math.max(0, (q[platId] || 0) + delta);
      return { ...q, [platId]: nouvelle };
    });
  }

  const lignesPanier = useMemo(() => {
    if (!donnees) return [];
    return donnees.plats.filter((p) => (quantites[p.id] || 0) > 0).map((p) => ({ ...p, quantite: quantites[p.id] }));
  }, [donnees, quantites]);

  const totalPanier = lignesPanier.reduce((s, l) => s + l.prix * l.quantite, 0);
  const nbArticles = lignesPanier.reduce((s, l) => s + l.quantite, 0);

  function envoyerViaWhatsApp() {
    if (lignesPanier.length === 0 || !donnees?.whatsapp) return;
    const detail = lignesPanier.map((l) => `• ${l.quantite}x ${l.nom} — ${(l.prix * l.quantite).toLocaleString("fr-FR")} ${donnees.devise}`).join("\n");
    const texte = `Bonjour ${donnees.nomBoutique} 👋${table ? `, je suis à la table ${table}` : ""} !\n\nJe voudrais commander :\n${detail}\n\nTotal : ${totalPanier.toLocaleString("fr-FR")} ${donnees.devise}`;
    window.open(`https://wa.me/${cleanPhoneForWhatsApp(donnees.whatsapp)}?text=${encodeURIComponent(texte)}`, "_blank");
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16231F", paddingBottom: lignesPanier.length > 0 ? 90 : 20 }}>
      <div style={{ background: "#0F3D26", color: "white", padding: "30px 18px 26px", textAlign: "center" }}>
        {donnees && <h1 style={{ fontSize: 24, margin: "0 0 4px", fontWeight: 800 }}>{donnees.nomBoutique}</h1>}
        <p style={{ margin: "4px auto 0", maxWidth: 420, fontSize: 13.5, color: "rgba(255,255,255,0.82)" }}>
          {table ? `Table ${table} · ` : ""}Composez votre commande, elle sera envoyée par WhatsApp.
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px" }}>
        {donnees === undefined && !erreur && <div style={{ textAlign: "center", color: "#8A9089", padding: 50 }}>Chargement du menu…</div>}
        {erreur && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
            <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
          </div>
        )}
        {donnees && donnees.plats.length === 0 && (
          <div style={{ textAlign: "center", color: "#6B7168", padding: "50px 10px", fontSize: 14.5 }}>Le menu n'est pas encore prêt. Revenez bientôt !</div>
        )}

        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>{cat}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {donnees.plats.filter((p) => p.categorie === cat).map((p) => (
                <div key={p.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nom}</div>
                    {p.description && <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>{p.description}</div>}
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: "#1a7a3c", marginTop: 4 }}>{p.prix.toLocaleString("fr-FR")} {donnees.devise}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {quantites[p.id] > 0 && (
                      <>
                        <button onClick={() => ajusterQuantite(p.id, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #DDD8CC", background: "white", fontSize: 15, cursor: "pointer" }}>−</button>
                        <span style={{ fontWeight: 700, fontSize: 14, minWidth: 14, textAlign: "center" }}>{quantites[p.id]}</span>
                      </>
                    )}
                    <button onClick={() => ajusterQuantite(p.id, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#1a7a3c", color: "white", fontSize: 15, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lignesPanier.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "12px 16px", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {panierOuvert && (
              <div style={{ marginBottom: 10, maxHeight: 160, overflowY: "auto" }}>
                {lignesPanier.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span>{l.quantite}x {l.nom}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{(l.prix * l.quantite).toLocaleString("fr-FR")} {donnees.devise}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setPanierOuvert(!panierOuvert)} style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                <div style={{ fontSize: 11.5, color: "#8A9089" }}>{nbArticles} article{nbArticles > 1 ? "s" : ""} {panierOuvert ? "▲" : "▼"}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 17, color: "#1a7a3c" }}>{totalPanier.toLocaleString("fr-FR")} {donnees.devise}</div>
              </button>
              <button onClick={envoyerViaWhatsApp} style={{ flex: 1, background: "#25d366", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                💬 Commander via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
