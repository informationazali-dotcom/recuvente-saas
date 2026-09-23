import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
//  Menu public d'un restaurant — accessible sans connexion, via "?menu=<slug>"
//  (ou "?menu_id=<id>" si la boutique n'a pas encore de lien publié), avec en plus
//  "&table=<numéro>" quand le client scanne le QR posé sur une table.
//  Toute la lecture (prix, disponibilité) et la création de commande passent par des
//  RPC "security definer" (menu_public / creer_commande_menu_public) : le prix et la
//  disponibilité affichés ici ne sont QUE pour l'affichage — le serveur relit toujours
//  la vraie valeur en base avant de créer la commande, donc rien envoyé par ce
//  navigateur (prix, quantité) n'est jamais accepté tel quel.
// ============================================================================

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function formaterDevise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : code;
}

function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  if (String(tel || "").trim().startsWith("+") && digits.length >= 9) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}

const S = {
  carte: { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16 },
  bouton: { background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  champ: { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box" },
};

const ETAPES_CUISINE = [
  { key: "nouvelle", label: "Commande reçue" },
  { key: "en_preparation", label: "En préparation" },
  { key: "prete", label: "Prête" },
  { key: "servie", label: "Servie" },
];

// Page de suivi (persistante, via "?suivi_menu=<id>") : différente de "?suivi=" (SuiviPublic)
// car les statuts de cuisine (nouvelle/en_preparation/prete/servie) ne correspondent pas aux
// statuts du flux COD (en_cours/confirmee/echouee) que SuiviPublic sait afficher.
function SuiviCommandeMenu({ suiviId }) {
  const [commande, setCommande] = useState(undefined);

  useEffect(() => {
    let vivant = true;
    function charger() {
      supabase.rpc("suivi_commande_menu_public", { p_id: suiviId }).then(({ data, error }) => {
        if (!vivant) return;
        if (error || !data || data.length === 0) setCommande(null);
        else setCommande(data[0]);
      });
    }
    charger();
    const id = setInterval(charger, 15000);
    return () => { vivant = false; clearInterval(id); };
  }, [suiviId]);

  if (commande === undefined) {
    return <div style={{ background: "#FAFAF7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#8A9089" }}>Chargement…</div>;
  }
  if (commande === null) {
    return (
      <div style={{ background: "#FAFAF7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20 }}>
        <div style={{ ...S.carte, maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ color: "#6B7168", fontSize: 14 }}>Commande introuvable.</div>
        </div>
      </div>
    );
  }

  const etapeActuelle = ETAPES_CUISINE.findIndex((e) => e.key === (commande.statut_cuisine || "nouvelle"));

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={S.carte}>
          <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase" }}>{commande.workspace_nom}</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{commande.produit}</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 20, color: "#1a7a3c", marginTop: 6 }}>
            {Number(commande.montant).toLocaleString("fr-FR")} {formaterDevise(commande.devise)}
          </div>
          <div style={{ fontSize: 12, color: "#8A9089", marginTop: 4 }}>
            {commande.type_commande === "sur_place" ? `Sur place${commande.table_numero ? " — Table " + commande.table_numero : ""}` : commande.type_commande === "emporter" ? "À emporter" : "Livraison"}
          </div>

          <div style={{ marginTop: 22, display: "flex", flexDirection: "column" }}>
            {ETAPES_CUISINE.map((etape, i) => {
              const atteint = i <= etapeActuelle;
              return (
                <div key={etape.key} style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: atteint ? "#1a7a3c" : "#ECE8DC", color: atteint ? "white" : "#8A9089", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {atteint ? "✓" : i + 1}
                    </div>
                    {i < ETAPES_CUISINE.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 26, background: i < etapeActuelle ? "#1a7a3c" : "#ECE8DC", marginTop: 2 }} />}
                  </div>
                  <div style={{ paddingBottom: 22 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: atteint ? "#16231F" : "#8A9089" }}>{etape.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuPublic({ slug, workspaceId, tableParam, suiviId: suiviIdInitial }) {
  const [suiviId, setSuiviId] = useState(suiviIdInitial || null);
  const [menu, setMenu] = useState(undefined); // undefined = chargement, null = introuvable
  const [panier, setPanier] = useState({}); // { platId: quantite }
  const [typeCommande, setTypeCommande] = useState("sur_place");
  const [tableId, setTableId] = useState("");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [zone, setZone] = useState("");
  const [note, setNote] = useState("");
  const [panierOuvert, setPanierOuvert] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState(null); // { commande_id, montant, devise }

  useEffect(() => {
    if (suiviId) return;
    supabase.rpc("menu_public", { p_slug: slug || null, p_workspace_id: workspaceId || null }).then(({ data, error }) => {
      if (error || !data || !data.trouve) { setMenu(null); return; }
      setMenu(data);
      if (tableParam) {
        const t = (data.tables || []).find(
          (x) => String(x.id) === String(tableParam) || String(x.numero).toLowerCase() === String(tableParam).toLowerCase()
        );
        if (t) setTableId(t.id);
      }
    });
  }, [slug, workspaceId, tableParam]);

  const categories = useMemo(() => {
    if (!menu) return [];
    return [...new Set((menu.plats || []).map((p) => p.categorie || "Plats"))];
  }, [menu]);

  const platsChoisis = useMemo(() => {
    if (!menu) return [];
    return (menu.plats || []).filter((p) => (panier[p.id] || 0) > 0);
  }, [menu, panier]);

  const totalPanier = platsChoisis.reduce((s, p) => s + (panier[p.id] || 0) * Number(p.prix), 0);
  const nbArticles = platsChoisis.reduce((s, p) => s + (panier[p.id] || 0), 0);

  function ajuster(platId, delta, disponible) {
    if (!disponible && delta > 0) return;
    setPanier((p) => ({ ...p, [platId]: Math.max(0, (p[platId] || 0) + delta) }));
  }

  const telValide = tel.replace(/\D/g, "").length >= 8;
  const livraisonValide = typeCommande !== "livraison" || zone.trim().length >= 3;
  const peutCommander = platsChoisis.length > 0 && telValide && livraisonValide && !envoiEnCours;

  function resumeTexte() {
    const lignes = platsChoisis.map((p) => `${panier[p.id]}x ${p.nom}`).join("\n");
    const table = tableId ? menu.tables.find((t) => t.id === tableId) : null;
    const typeLabel = typeCommande === "sur_place" ? `Sur place${table ? ` — Table ${table.numero}` : ""}` : typeCommande === "emporter" ? "À emporter" : `Livraison — ${zone.trim()}`;
    return `Bonjour ${menu.nom}, je voudrais commander :\n${lignes}\n\nTotal : ${totalPanier.toLocaleString("fr-FR")} ${formaterDevise(menu.devise)}\n${typeLabel}\n${nom.trim() ? "Nom : " + nom.trim() + "\n" : ""}Tél : ${tel.trim()}${note.trim() ? "\nNote : " + note.trim() : ""}`;
  }

  function commanderWhatsApp() {
    if (!menu?.whatsapp) return;
    const url = `https://wa.me/${cleanPhoneForWhatsApp(menu.whatsapp)}?text=${encodeURIComponent(resumeTexte())}`;
    window.open(url, "_blank");
  }

  async function envoyerCommande() {
    if (!peutCommander) return;
    setEnvoiEnCours(true);
    setErreur("");
    const items = platsChoisis.map((p) => ({ plat_id: p.id, quantite: panier[p.id] }));
    const { data, error } = await supabase.rpc("creer_commande_menu_public", {
      p_slug: slug || null,
      p_workspace_id: workspaceId || null,
      p_type_commande: typeCommande,
      p_table_id: tableId || null,
      p_items: items,
      p_client: nom.trim() || null,
      p_tel: tel.trim(),
      p_zone: typeCommande === "livraison" ? zone.trim() : null,
      p_note: note.trim() || null,
    });
    setEnvoiEnCours(false);
    const ligne = Array.isArray(data) ? data[0] : data;
    if (error || !ligne || !ligne.succes) {
      setErreur(ligne?.message || "Impossible d'envoyer la commande, réessaie.");
      return;
    }
    // Alerte au propriétaire — même mécanisme que le reste de l'app (api/notifications.js),
    // sans effet si personne n'a activé les notifications côté boutique.
    try {
      fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "nouvelle_commande", commandeId: ligne.commande_id }), keepalive: true }).catch(() => {});
    } catch (_) {}
    setResultat({ id: ligne.commande_id, montant: ligne.montant, devise: ligne.devise });
    setPanier({});
    setPanierOuvert(false);
    // Bascule sur une page de suivi persistante (survit à un rechargement / fermeture du navigateur) :
    // "?suivi_menu=<id>" est propre à ce flux, car les statuts de cuisine (nouvelle/en_preparation/
    // prete/servie) ne correspondent pas à ceux du "?suivi=" existant (flux COD).
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("suivi_menu", ligne.commande_id);
      window.history.replaceState({}, "", url.toString());
    } catch (_) {}
    setSuiviId(ligne.commande_id);
  }

  if (suiviId) return <SuiviCommandeMenu suiviId={suiviId} />;

  if (menu === undefined) {
    return <div style={{ background: "#FAFAF7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#8A9089" }}>Chargement du menu…</div>;
  }
  if (menu === null) {
    return (
      <div style={{ background: "#FAFAF7", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20 }}>
        <div style={{ ...S.carte, maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ color: "#6B7168", fontSize: 14 }}>Ce menu est introuvable ou n'est plus disponible.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: nbArticles > 0 ? 90 : 20 }}>
      <div style={{ background: "#1a7a3c", color: "white", padding: "22px 16px 18px" }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{menu.nom}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>Commande ton repas directement depuis ton téléphone.</div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[
            { key: "sur_place", label: "🍽️ Sur place" },
            { key: "emporter", label: "🥡 Emporter" },
            { key: "livraison", label: "🚚 Livraison" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTypeCommande(t.key)} style={{ flex: 1, background: typeCommande === t.key ? "#1a7a3c" : "white", color: typeCommande === t.key ? "white" : "#16231F", border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>

        {typeCommande === "sur_place" && (menu.tables || []).length > 0 && (
          <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={{ ...S.champ, marginBottom: 16, background: "white" }}>
            <option value="">Choisis ta table...</option>
            {menu.tables.map((t) => (
              <option key={t.id} value={t.id}>Table {t.numero}</option>
            ))}
          </select>
        )}

        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>{cat}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {menu.plats.filter((p) => (p.categorie || "Plats") === cat).map((p) => (
                <div key={p.id} data-testid={`plat-${p.id}`} style={{ ...S.carte, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", opacity: p.disponible ? 1 : 0.55 }}>
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.nom} style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 8, background: "#F0EEE6", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nom}{!p.disponible && <span style={{ color: "#D64933", fontWeight: 700, fontSize: 11 }}> · Épuisé</span>}</div>
                    {p.description && <div style={{ fontSize: 11, color: "#8A9089", marginTop: 1 }}>{p.description}</div>}
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: "#1a7a3c", marginTop: 2 }}>{Number(p.prix).toLocaleString("fr-FR")} {formaterDevise(menu.devise)}</div>
                  </div>
                  {p.disponible ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => ajuster(p.id, -1, p.disponible)} style={{ width: 28, height: 28, borderRadius: "50%", background: "white", border: "1px solid #DDD8CC", fontSize: 15, cursor: "pointer" }}>−</button>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 16, textAlign: "center" }}>{panier[p.id] || 0}</span>
                      <button onClick={() => ajuster(p.id, 1, p.disponible)} style={{ width: 28, height: 28, borderRadius: "50%", background: "#1a7a3c", color: "white", border: "none", fontSize: 15, cursor: "pointer" }}>+</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#8A9089", flexShrink: 0 }}>Indisponible</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {menu.plats.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Le menu n'est pas encore prêt — reviens un peu plus tard.</div>
        )}
      </div>

      {nbArticles > 0 && !panierOuvert && (
        <button onClick={() => setPanierOuvert(true)} style={{ position: "fixed", left: 16, right: 16, bottom: 16, background: "#1a7a3c", color: "white", border: "none", borderRadius: 12, padding: "14px 16px", fontWeight: 700, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", cursor: "pointer" }}>
          <span>🛒 {nbArticles} article{nbArticles > 1 ? "s" : ""}</span>
          <span>{totalPanier.toLocaleString("fr-FR")} {formaterDevise(menu.devise)}</span>
        </button>
      )}

      {panierOuvert && (
        <div onClick={() => setPanierOuvert(false)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "20px 18px 26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Ta commande</div>
              <button onClick={() => setPanierOuvert(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {platsChoisis.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{panier[p.id]}× {p.nom}</span>
                  <span style={{ fontWeight: 700 }}>{(panier[p.id] * Number(p.prix)).toLocaleString("fr-FR")} {formaterDevise(menu.devise)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #ECE8DC", marginBottom: 14, fontWeight: 700 }}>
              <span>Total</span>
              <span style={{ color: "#1a7a3c", fontFamily: "monospace", fontSize: 16 }}>{totalPanier.toLocaleString("fr-FR")} {formaterDevise(menu.devise)}</span>
            </div>

            {typeCommande === "livraison" && (
              <input placeholder="Quartier / adresse de livraison" value={zone} onChange={(e) => setZone(e.target.value)} style={{ ...S.champ, marginBottom: 8 }} />
            )}
            <input placeholder="Ton nom (optionnel)" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...S.champ, marginBottom: 8 }} />
            <input placeholder="Ton téléphone (obligatoire)" value={tel} onChange={(e) => setTel(e.target.value)} style={{ ...S.champ, marginBottom: 8 }} />
            <textarea placeholder="Note (allergie, sans piment...) — optionnel" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...S.champ, marginBottom: 8, fontFamily: "inherit", resize: "vertical" }} />

            {!telValide && tel && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 8 }}>Indique un numéro de téléphone valide.</div>}
            {!livraisonValide && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 8 }}>Indique ton quartier ou ton adresse.</div>}
            {erreur && <div style={{ color: "#B23A26", background: "#FBEAE6", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginBottom: 10 }}>{erreur}</div>}

            <button onClick={envoyerCommande} disabled={!peutCommander} style={{ ...S.bouton, width: "100%", marginBottom: 8, opacity: peutCommander ? 1 : 0.5, cursor: peutCommander ? "pointer" : "not-allowed" }}>
              {envoiEnCours ? "Envoi..." : "Commander"}
            </button>
            {menu.whatsapp && (
              <button onClick={commanderWhatsApp} disabled={platsChoisis.length === 0} style={{ width: "100%", background: "#25D366", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: platsChoisis.length === 0 ? 0.5 : 1 }}>
                💬 Commander par WhatsApp
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
