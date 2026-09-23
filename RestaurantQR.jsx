import React from "react";

// ============================================================================
//  "Mes QR" : lien du menu public + un QR code par table, plus une planche A4 à imprimer.
//  Les images QR viennent de api.qrserver.com (pas de nouvelle dépendance npm) : un simple
//  <img>, rien d'exécuté, rien de sensible dans l'URL (juste le lien public du menu).
// ============================================================================

function lienMenu(workspace, table) {
  const base = window.location.origin;
  const racine = workspace.slug ? `${base}/?menu=${encodeURIComponent(workspace.slug)}` : `${base}/?menu_id=${encodeURIComponent(workspace.id)}`;
  return table ? `${racine}&table=${encodeURIComponent(table.id)}` : racine;
}

function urlQr(lien, taille = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${taille}x${taille}&data=${encodeURIComponent(lien)}`;
}

function imprimerPlanche(workspace, tablesRestaurant) {
  const fenetre = window.open("", "_blank");
  if (!fenetre) return;
  const cartes = tablesRestaurant.map((t) => {
    const lien = lienMenu(workspace, t);
    return `<div class="carte">
      <div class="titre">Scanne pour commander</div>
      <div class="table">Table ${String(t.numero).replace(/</g, "")}</div>
      <img src="${urlQr(lien, 260)}" width="200" height="200" />
      <div class="nom">${(workspace.name || "").replace(/</g, "")}</div>
    </div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>QR tables — ${(workspace.name || "").replace(/</g, "")}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: sans-serif; margin: 0; }
    .grille { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
    .carte { border: 1px dashed #999; border-radius: 10px; padding: 12mm 8mm; text-align: center; break-inside: avoid; }
    .titre { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #16231F; }
    .table { font-weight: 900; font-size: 22px; margin-bottom: 10px; color: #1a7a3c; }
    .nom { font-size: 11px; color: #6B7168; margin-top: 8px; }
  </style></head>
  <body onload="window.print()"><div class="grille">${cartes}</div></body></html>`;
  fenetre.document.write(html);
  fenetre.document.close();
}

export default function RestaurantQR({ workspace, tablesRestaurant = [] }) {
  const lienGeneral = lienMenu(workspace, null);

  return (
    <div style={{ padding: "20px 20px 40px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>📲 QR & menu public</div>
      <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 20 }}>
        Tes clients scannent le QR d'une table (ou ouvrent simplement le lien) pour voir ton menu et commander depuis leur téléphone.
      </div>

      {!workspace.slug && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDB0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#8A6412" }}>
          Ta boutique n'a pas encore de lien court (slug) publié — ce lien fonctionne quand même, mais il sera plus court une fois ta boutique publiée depuis le Store Builder.
        </div>
      )}

      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18, marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Lien général du menu</div>
        <img src={urlQr(lienGeneral, 220)} alt="QR menu" width={180} height={180} style={{ borderRadius: 10 }} />
        <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 600, marginTop: 10, wordBreak: "break-all" }}>{lienGeneral}</div>
        <button
          onClick={() => { navigator.clipboard?.writeText(lienGeneral).catch(() => {}); }}
          style={{ marginTop: 10, background: "#F4F1E8", color: "#16231F", border: "1px solid #DDD8CC", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
        >
          📋 Copier le lien
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>QR par table ({tablesRestaurant.length})</div>
        {tablesRestaurant.length > 0 && (
          <button onClick={() => imprimerPlanche(workspace, tablesRestaurant)} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            🖨️ Imprimer la planche A4
          </button>
        )}
      </div>

      {tablesRestaurant.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>
          Aucune table pour l'instant — ajoute tes tables depuis l'écran "Menu".
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {tablesRestaurant.map((t) => (
            <div key={t.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Table {t.numero}</div>
              <img src={urlQr(lienMenu(workspace, t), 200)} alt={`QR table ${t.numero}`} width={130} height={130} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
