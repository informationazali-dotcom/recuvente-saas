import React, { useState, useEffect, useMemo } from "react";

// Annuaire public des boutiques RecuVente : uniquement celles qui ont choisi d'y apparaître (et dont la boutique est publiée).
export default function AnnuairePublic() {
  const [donnees, setDonnees] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("Toutes");

  useEffect(() => {
    document.title = "Annuaire des boutiques — RecuVente";
    fetch("/api/facebook-capi?annuaire=1").then((r) => (r.ok ? r.json() : null)).then((j) => setDonnees(j || { boutiques: [], categories: [] })).catch(() => setDonnees({ boutiques: [], categories: [] }));
  }, []);

  const boutiques = donnees?.boutiques || [];
  const categoriesUtiles = useMemo(() => ["Toutes", ...(donnees?.categories || []).filter((c) => boutiques.some((b) => b.categorie === c))], [donnees]);
  const filtrees = boutiques.filter((b) => (categorie === "Toutes" || b.categorie === categorie) && (!recherche.trim() || `${b.nom} ${b.description} ${b.categorie}`.toLowerCase().includes(recherche.trim().toLowerCase())));

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16231F" }}>
      <div style={{ background: "#0F3D26", color: "white", padding: "34px 18px 30px", textAlign: "center" }}>
        <a href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>← RecuVente</a>
        <h1 style={{ fontSize: 28, margin: "12px 0 6px", fontWeight: 800 }}>Annuaire des boutiques</h1>
        <p style={{ margin: "0 auto", maxWidth: 480, fontSize: 14.5, lineHeight: 1.55, color: "rgba(255,255,255,0.82)" }}>Découvrez des boutiques en ligne d'Afrique francophone, livrées chez vous avec paiement à la livraison.</p>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une boutique ou un produit…" style={{ marginTop: 18, width: "100%", maxWidth: 420, padding: "12px 16px", borderRadius: 99, border: "none", fontSize: 15, boxSizing: "border-box" }} />
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 16px 40px" }}>
        {categoriesUtiles.length > 2 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }}>
            {categoriesUtiles.map((c) => (
              <button key={c} onClick={() => setCategorie(c)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: categorie === c ? "1px solid #1a7a3c" : "1px solid #DDD8CC", background: categorie === c ? "#1a7a3c" : "white", color: categorie === c ? "white" : "#16231F" }}>{c}</button>
            ))}
          </div>
        )}

        {donnees === null && <div style={{ textAlign: "center", color: "#8A9089", padding: 50 }}>Chargement…</div>}
        {donnees !== null && filtrees.length === 0 && (
          <div style={{ textAlign: "center", color: "#6B7168", padding: "50px 10px", fontSize: 14.5 }}>
            {boutiques.length === 0 ? "L'annuaire se remplit petit à petit. Revenez bientôt !" : "Aucune boutique ne correspond à votre recherche."}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 8 }}>
          {filtrees.map((b) => (
            <a key={b.slug} href={`/?boutique=${encodeURIComponent(b.slug)}`} style={{ textDecoration: "none", color: "inherit", background: "white", border: b.a_la_une ? "2px solid #E8920A" : "1px solid #ECE8DC", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {b.logo ? <img src={b.logo} alt="" loading="lazy" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#EEF0EA" }} /> : <div style={{ width: 52, height: 52, borderRadius: 12, background: "#1a7a3c", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>{String(b.nom || "?").charAt(0).toUpperCase()}</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nom}</div>
                  <div style={{ fontSize: 12, color: "#6B7168" }}>{b.categorie}{b.a_la_une ? " · ⭐ À la une" : ""}</div>
                </div>
              </div>
              {b.description && <div style={{ fontSize: 13, color: "#4B524B", lineHeight: 1.5 }}>{b.description}</div>}
              <div style={{ marginTop: "auto", color: "#1a7a3c", fontWeight: 700, fontSize: 13.5 }}>Visiter la boutique →</div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 34, background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 20, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Vous vendez en ligne ?</div>
          <div style={{ fontSize: 13.5, color: "#6B7168", margin: "6px 0 14px" }}>Créez votre boutique avec RecuVente : commandes, livreurs, relances et suivi des paiements au même endroit.</div>
          <a href="/" style={{ display: "inline-block", background: "#1a7a3c", color: "white", textDecoration: "none", padding: "12px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}>Créer ma boutique</a>
        </div>
        <div style={{ textAlign: "center", fontSize: 11.5, color: "#8A9089", marginTop: 14 }}>Seules les boutiques qui l'ont demandé apparaissent ici.</div>
      </div>
    </div>
  );
}
