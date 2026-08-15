 import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function CommanderPublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [erreur, setErreur] = useState(null);
  const [envoye, setEnvoye] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [messageErreur, setMessageErreur] = useState("");
  const [form, setForm] = useState({ client: "", tel: "", produit: "", montant: "" });

  useEffect(() => {
    supabase.rpc("info_entreprise_publique", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) setErreur("Ce lien de commande est invalide.");
      else setEntreprise(data[0]);
    });
  }, [workspaceId]);

  const montantValide = Number(form.montant) > 0;
  const canSubmit = form.client.trim() && form.tel.trim() && form.produit.trim() && montantValide;

  async function envoyer() {
    if (!canSubmit) return;
    setEnvoiEnCours(true);
    setMessageErreur("");
    const { data, error } = await supabase.rpc("creer_commande_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_produit: form.produit,
      p_montant: Number(form.montant),
    });
    if (error || !data?.[0]?.succes) {
      setMessageErreur(data?.[0]?.message || "Une erreur est survenue, réessaie.");
    } else {
      setEnvoye(true);
    }
    setEnvoiEnCours(false);
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {entreprise === undefined && !erreur && <div style={{ textAlign: "center", color: "#8A9089" }}>Chargement…</div>}

        {erreur && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
          </div>
        )}

        {entreprise && !envoye && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase" }}>{entreprise.nom}</div>
            <div style={{ fontWeight: 700, fontSize: 19, marginTop: 4, marginBottom: 4 }}>Passer ma commande</div>
            <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
              Remplis tes informations, {entreprise.nom} te contactera pour confirmer.
            </div>

            {[
              { key: "client", label: "Ton nom", type: "text" },
              { key: "tel", label: "Ton téléphone", type: "text" },
              { key: "produit", label: "Ce que tu veux commander", type: "text" },
              { key: "montant", label: `Montant (${entreprise.devise})`, type: "number" },
            ].map((champ) => (
              <div key={champ.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 4 }}>{champ.label}</label>
                <input
                  value={form[champ.key]}
                  onChange={(e) => setForm({ ...form, [champ.key]: e.target.value })}
                  type={champ.type}
                  min={champ.type === "number" ? "1" : undefined}
                  style={{ width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            ))}

            {form.montant && !montantValide && (
              <div style={{ color: "#D64933", fontSize: 12, marginTop: -6, marginBottom: 10 }}>Le montant doit être supérieur à 0.</div>
            )}
            {messageErreur && (
              <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{messageErreur}</div>
            )}

            <button
              onClick={envoyer}
              disabled={!canSubmit || envoiEnCours}
              style={{ width: "100%", marginTop: 6, background: canSubmit ? "#1a7a3c" : "#DDD8CC", color: "white", border: "none", padding: "13px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              {envoiEnCours ? "..." : "Envoyer ma commande"}
            </button>
          </div>
        )}

        {envoye && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Commande envoyée !</div>
            <div style={{ fontSize: 13.5, color: "#6B7168" }}>
              {entreprise.nom} va te recontacter très bientôt pour confirmer.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
