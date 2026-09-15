import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function formaterDevise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : code;
}

function getMarketingContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const current = Object.fromEntries(keys.map((key) => [key, params.get(key) || null]));
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("rv_marketing_attribution") || "{}"); } catch (_) {}
  const merged = {
    ...stored,
    ...Object.fromEntries(keys.map((key) => [key, current[key] || stored[key] || null])),
  };
  if (keys.some((key) => current[key])) {
    try { localStorage.setItem("rv_marketing_attribution", JSON.stringify(merged)); } catch (_) {}
  }
  return merged;
}

function getVisitorId() {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem("rv_marketing_visitor_id");
    if (!id) {
      id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("rv_marketing_visitor_id", id);
    }
    return id;
  } catch (_) { return null; }
}

function getSessionId() {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem("rv_marketing_session_id");
    if (!id) {
      id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("rv_marketing_session_id", id);
    }
    return id;
  } catch (_) { return null; }
}

function getMetaIds() {
  if (typeof window === "undefined") return { fbp: null, fbc: null };
  const readCookie = (name) => {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
  };
  const params = new URLSearchParams(window.location.search);
  let fbp = readCookie("_fbp");
  let fbc = readCookie("_fbc");
  const fbclid = params.get("fbclid");
  try {
    const saved = JSON.parse(localStorage.getItem("rv_meta_attribution") || "{}");
    fbp = fbp || saved.fbp || null;
    fbc = fbc || saved.fbc || null;
  } catch (_) {}
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  try { localStorage.setItem("rv_meta_attribution", JSON.stringify({ fbp, fbc, updated_at: Date.now() })); } catch (_) {}
  return { fbp, fbc };
}

function eventId(prefix = "evt") {
  return `${prefix}_${crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export default function CommanderPublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [erreur, setErreur] = useState(null);
  const [envoye, setEnvoye] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [messageErreur, setMessageErreur] = useState("");
  const [form, setForm] = useState({ client: "", tel: "", produit: "", montant: "" });
  const [codeReferral] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("rv_referral_code") || null; }
    catch (_) { return null; }
  });

  const marketing = getMarketingContext();
  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const meta = getMetaIds();

  useEffect(() => {
    supabase.rpc("info_entreprise_publique", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) setErreur("Ce lien de commande est invalide.");
      else setEntreprise(data[0]);
    });
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !sessionId || !visitorId) return;
    const landingPage = `${window.location.pathname}${window.location.search}`;
    supabase.rpc("enregistrer_session_marketing_publique", {
      p_workspace_id: workspaceId,
      p_session_id: sessionId,
      p_visitor_id: visitorId,
      p_source: marketing.utm_source,
      p_medium: marketing.utm_medium,
      p_campaign: marketing.utm_campaign,
      p_content: marketing.utm_content,
      p_term: marketing.utm_term,
      p_referrer_url: document.referrer || null,
      p_landing_page: landingPage,
      p_fbp: meta.fbp,
      p_fbc: meta.fbc,
      p_user_agent: navigator.userAgent,
    }).then(() => {
      supabase.rpc("enregistrer_evenement_marketing_public", {
        p_workspace_id: workspaceId,
        p_event_name: "page_viewed",
        p_event_id: eventId("page"),
        p_session_id: sessionId,
        p_visitor_id: visitorId,
        p_metadata: { page: "commande_publique" },
      }).catch(() => {});
    }).catch(() => {});
  }, [workspaceId]);

  const montantValide = Number(form.montant) > 0;
  const canSubmit = form.client.trim() && form.tel.trim() && form.produit.trim() && montantValide;

  async function envoyer() {
    if (!canSubmit) return;
    setEnvoiEnCours(true);
    setMessageErreur("");

    await supabase.rpc("enregistrer_evenement_marketing_public", {
      p_workspace_id: workspaceId,
      p_event_name: "checkout_contact_submitted",
      p_event_id: eventId("contact"),
      p_session_id: sessionId,
      p_visitor_id: visitorId,
      p_value: Number(form.montant),
      p_currency: entreprise?.devise || "XOF",
      p_metadata: { product_text: form.produit },
    }).catch(() => {});

    const { data, error } = await supabase.rpc("creer_commande_multi_publique_v3", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: "",
      p_items: [{ produit_id: null, produit_nom: form.produit, quantite: 1, prix_unitaire: Number(form.montant) }],
      p_type_livraison: "livraison",
      p_fbp: meta.fbp,
      p_fbc: meta.fbc,
      p_user_agent: navigator.userAgent,
      p_event_source_url: window.location.href,
      p_source_campagne: marketing.utm_campaign || marketing.utm_source || null,
      p_referral_code: codeReferral,
      p_session_id: sessionId,
      p_visitor_id: visitorId,
      p_utm_source: marketing.utm_source,
      p_utm_medium: marketing.utm_medium,
      p_utm_campaign: marketing.utm_campaign,
      p_utm_content: marketing.utm_content,
      p_utm_term: marketing.utm_term,
      p_referrer_url: document.referrer || null,
      p_landing_page: `${window.location.pathname}${window.location.search}`,
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
        {erreur && <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div><div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div></div>}
        {entreprise && !envoye && (
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase" }}>{entreprise.nom}</div>
            <div style={{ fontWeight: 700, fontSize: 19, marginTop: 4, marginBottom: 4 }}>Passer ma commande</div>
            <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>Remplis tes informations, {entreprise.nom} te contactera pour confirmer.</div>
            {[{ key: "client", label: "Ton nom", type: "text" }, { key: "tel", label: "Ton téléphone", type: "text" }, { key: "produit", label: "Ce que tu veux commander", type: "text" }, { key: "montant", label: `Montant (${formaterDevise(entreprise.devise)})`, type: "number" }].map((champ) => (
              <div key={champ.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 4 }}>{champ.label}</label>
                <input value={form[champ.key]} onChange={(e) => setForm({ ...form, [champ.key]: e.target.value })} type={champ.type} min={champ.type === "number" ? "1" : undefined} style={{ width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            {form.montant && !montantValide && <div style={{ color: "#D64933", fontSize: 12, marginTop: -6, marginBottom: 10 }}>Le montant doit être supérieur à 0.</div>}
            {messageErreur && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{messageErreur}</div>}
            <button onClick={envoyer} disabled={!canSubmit || envoiEnCours} style={{ width: "100%", marginTop: 6, background: canSubmit ? "#1a7a3c" : "#DDD8CC", color: "white", border: "none", padding: "13px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed" }}>{envoiEnCours ? "..." : "Envoyer ma commande"}</button>
          </div>
        )}
        {envoye && <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div><div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Commande envoyée !</div><div style={{ fontSize: 13.5, color: "#6B7168" }}>{entreprise.nom} va te recontacter très bientôt pour confirmer.</div></div>}
      </div>
    </div>
  );
}
