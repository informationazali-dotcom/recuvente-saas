import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function formaterDevise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : code;
}

const ETAPES = [
  { key: "en_cours", label: "Commande reçue" },
  { key: "confirmee", label: "Livrée" },
];

// Boutique multi-pays : le lien de suivi peut porter le montant exact que le client a vu dans SA monnaie
// (« &aff=150 000 GNF », recopié de la note « À encaisser » de la commande). Affichage seulement ; on n'accepte
// qu'un format strict « nombre + code monnaie » pour ne jamais afficher autre chose.
function montantAffichePropre() {
  try {
    const v = new URLSearchParams(window.location.search).get("aff") || "";
    return /^[\d\s\u00a0\u202f.,]{1,20}\s[A-Za-zÀ-ÿ€ ]{1,12}$/.test(v) ? v : "";
  } catch (_) { return ""; }
}

export default function SuiviPublic({ commandeId }) {
  const [commande, setCommande] = useState(undefined);
  const [erreur, setErreur] = useState(null);
  const [confirme, setConfirme] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Paiement en ligne (facultatif, seulement si le commerçant l'a branché)
  const [paiement, setPaiement] = useState(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [erreurPaiement, setErreurPaiement] = useState("");
  const retourDePaiement = (() => { try { return new URLSearchParams(window.location.search).get("paye") === "1"; } catch (_) { return false; } })();

  async function confirmerReception() {
    setEnvoiEnCours(true);
    const { error } = await supabase.rpc("confirmer_reception_public", { p_id: commandeId });
    if (!error) setConfirme(true);
    setEnvoiEnCours(false);
  }

  useEffect(() => {
    supabase.rpc("suivi_commande_public", { p_id: commandeId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) setErreur("Commande introuvable.");
      else setCommande(data[0]);
    });
  }, [commandeId]);

  // État du paiement en ligne. Au retour de la page de paiement, on revérifie quelques secondes le temps que la banque confirme.
  useEffect(() => {
    let vivant = true; let essais = 0; let minuteur = null;
    const charger = () => fetch(`/api/facebook-capi?paiement_statut=${encodeURIComponent(commandeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivant || !j) return;
        setPaiement(j);
        essais += 1;
        if (retourDePaiement && !j.paye_en_ligne && j.reste > 0 && essais < 12) minuteur = setTimeout(charger, 4000);
      })
      .catch(() => {});
    charger();
    return () => { vivant = false; if (minuteur) clearTimeout(minuteur); };
  }, [commandeId]);

  async function payerMaintenant() {
    setPaiementEnCours(true); setErreurPaiement("");
    try {
      const r = await fetch("/api/facebook-capi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payer_en_ligne", commandeId }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setErreurPaiement(j.error || "Paiement en ligne indisponible pour l'instant.");
    } catch (_) { setErreurPaiement("Connexion impossible, réessayez."); }
    setPaiementEnCours(false);
  }

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
              {montantAffichePropre() || `${Number(commande.montant).toLocaleString("fr-FR")} ${formaterDevise(commande.devise)}`}
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

            {paiement && paiement.paye_en_ligne && (
              <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "12px 14px", marginTop: 16, textAlign: "center", fontSize: 13.5, color: "#3B6D11", fontWeight: 700 }}>
                ✅ Paiement en ligne reçu{paiement.reste > 0 ? ` — reste ${Number(paiement.reste).toLocaleString("fr-FR")} ${formaterDevise(commande.devise)} à régler` : " — merci !"}
              </div>
            )}
            {retourDePaiement && paiement && !paiement.paye_en_ligne && paiement.reste > 0 && (
              <div style={{ background: "#FBF3E3", border: "1px solid #F0DDB0", borderRadius: 12, padding: "12px 14px", marginTop: 16, textAlign: "center", fontSize: 13, color: "#8A6412", fontWeight: 600 }}>
                ⏳ Nous vérifions votre paiement… Cela peut prendre quelques instants.
              </div>
            )}
            {paiement && paiement.paiement_possible && etapeActuelle !== -1 && !(retourDePaiement && paiement.en_attente) && (
              <div style={{ marginTop: 16 }}>
                <button onClick={payerMaintenant} disabled={paiementEnCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", padding: "13px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: paiementEnCours ? 0.7 : 1 }}>
                  {paiementEnCours ? "Ouverture du paiement…" : `💳 Payer maintenant (${Number(paiement.reste).toLocaleString("fr-FR")} ${formaterDevise(commande.devise)})`}
                </button>
                <div style={{ fontSize: 11.5, color: "#8A9089", textAlign: "center", marginTop: 6 }}>Mobile Money ou carte. Facultatif : vous pouvez aussi payer à la livraison.</div>
                {erreurPaiement && <div style={{ fontSize: 12, color: "#B23A26", textAlign: "center", marginTop: 6 }}>{erreurPaiement}</div>}
              </div>
            )}

            {etapeActuelle === 1 && !confirme && (
              <button
                onClick={confirmerReception}
                disabled={envoiEnCours}
                style={{ width: "100%", marginTop: 16, background: "#1a7a3c", color: "white", border: "none", padding: "13px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                {envoiEnCours ? "..." : "✅ Je confirme avoir bien reçu ma commande"}
              </button>
            )}
            {confirme && (
              <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "12px 14px", marginTop: 16, textAlign: "center", fontSize: 13, color: "#3B6D11", fontWeight: 600 }}>
                🙏 Merci pour ta confirmation !
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
