import React, { useState, useEffect, useRef } from "react";
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

// --- Pixel Facebook / TikTok + Conversions API (§ audit P1 : ce lien de commande directe
// enregistrait déjà tout dans le tableau de bord interne, mais n'envoyait RIEN à Meta/TikTok —
// aucune commande passée par ici ne pouvait donc servir à optimiser une publicité. Même code que
// CataloguePublic.jsx (chargerPixelFacebook / chargerPixelTiktok / envoyerEvenementServeur /
// envoyerEvenementCapi), copié tel quel pour rester strictement cohérent avec le tracking déjà en
// production sur le catalogue.
function chargerPixelFacebook(pixelId, pixelFbRef) {
  if (!pixelId) return;
  pixelFbRef.current = pixelId;
  if (window.fbq) {
    if (window.__RV_FB && window.__RV_FB !== pixelId) {
      window.fbq("init", pixelId);
      window.fbq("trackSingle", pixelId, "PageView");
      window.__RV_FB = pixelId;
    }
    return;
  }
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
  window.__RV_FB = pixelId;
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

function chargerPixelTiktok(pixelId) {
  if (!pixelId || window.ttq) return;
  (function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = (w[t] = w[t] || []);
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = function (t, e) {
      t[e] = function () {
        t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) {
      var e = ttq._i[t] || [];
      for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function (e, n) {
      var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {};
      ttq._i[e] = [];
      ttq._i[e]._u = i;
      ttq._t = ttq._t || {};
      ttq._t[e] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[e] = n || {};
      var o = d.createElement("script");
      o.type = "text/javascript";
      o.async = !0;
      o.src = i + "?sdkid=" + e + "&lib=" + t;
      var a = d.getElementsByTagName("script")[0];
      a.parentNode.insertBefore(o, a);
    };
    ttq.load(pixelId);
    ttq.page();
  })(window, document, "ttq");
}

// Copie « serveur » (Conversions API) de l'InitiateCheckout : sur iPhone, dans le navigateur
// intégré de Facebook/Instagram ou avec un bloqueur de publicités, le Pixel du navigateur est
// souvent bloqué ou retardé. Le même eventID est envoyé des deux côtés pour que Meta déduplique.
function envoyerEvenementServeur(workspaceId, pixelFbRef, meta, nom, params, eventID) {
  if (!workspaceId || !pixelFbRef.current) return;
  try {
    fetch("/api/facebook-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        nom,
        eventId: eventID,
        fbp: meta.fbp,
        fbc: meta.fbc,
        url: window.location.href,
        params: {
          value: params?.value,
          currency: params?.currency,
          content_type: params?.content_type,
          content_name: params?.content_name,
          num_items: params?.num_items,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

// Purchase, envoyé UNIQUEMENT côté serveur (le serveur retrouve lui-même le Pixel/jeton CAPI de
// la boutique à partir de commandeId — pas besoin du Pixel ID ici) — même fonction que
// CataloguePublic.jsx.
async function envoyerEvenementCapi(commandeId) {
  if (!commandeId) return false;
  const cle = `rv_capi_purchase_${commandeId}`;
  try {
    if (sessionStorage.getItem(cle) === "sent") return true;
  } catch (_) {}

  for (let tentative = 0; tentative < 3; tentative++) {
    try {
      const reponse = await fetch("/api/facebook-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandeId }),
        keepalive: true,
      });
      const resultat = await reponse.json().catch(() => ({}));
      if (reponse.ok && (resultat.envoye || resultat.raison === "Déjà envoyé précédemment pour cette commande")) {
        try { sessionStorage.setItem(cle, "sent"); } catch (_) {}
        return true;
      }
    } catch (_) {}
    if (tentative < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (tentative + 1)));
  }
  return false;
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
  const pixelFbRef = useRef(null);

  const EVENEMENTS_DOUBLES = ["InitiateCheckout"];
  function trackEvenement(nom, params = {}, options = {}) {
    let eventID = options.eventID;
    const doubler = EVENEMENTS_DOUBLES.includes(nom);
    if (doubler && !eventID) eventID = eventId(nom.toLowerCase());
    if (window.fbq) {
      if (eventID) window.fbq("track", nom, params, { eventID });
      else window.fbq("track", nom, params);
    }
    if (doubler) envoyerEvenementServeur(workspaceId, pixelFbRef, meta, nom, params, eventID);
    if (window.ttq) {
      window.ttq.track(nom, {
        content_type: params?.content_type || "product",
        content_name: params?.content_name,
        value: params?.value,
        currency: params?.currency,
        quantity: params?.num_items,
      });
    }
  }

  useEffect(() => {
    supabase.rpc("info_entreprise_publique", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) { setErreur("Ce lien de commande est invalide."); return; }
      setEntreprise(data[0]);
      chargerPixelFacebook(data[0].facebook_pixel_id, pixelFbRef);
      chargerPixelTiktok(data[0].tiktok_pixel_id);
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

    // Signal envoyé à Meta/TikTok pour la première fois sur ce lien (voir audit P1) : jusqu'ici
    // ce formulaire était invisible aux deux, malgré le tracking interne ci-dessus.
    trackEvenement("InitiateCheckout", {
      content_type: "product",
      content_name: form.produit,
      value: Number(form.montant),
      currency: entreprise?.devise || "XOF",
      num_items: 1,
    });

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
    // Alerte de vente forte sur le téléphone du commerçant (sans effet si personne n'a activé les alertes).
    try {
      const idNouvelleCommande = data[0].commande_id || data[0].id;
      if (idNouvelleCommande) fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "nouvelle_commande", commandeId: idNouvelleCommande }), keepalive: true }).catch(() => {});
      // Purchase envoyé à Meta/TikTok (même principe que CataloguePublic.jsx : CAPI côté serveur
      // + événement navigateur avec le même eventID, pour que Meta déduplique au lieu de compter
      // deux achats).
      if (idNouvelleCommande) {
        trackEvenement("Purchase", {
          content_type: "product",
          content_name: form.produit,
          value: Number(form.montant),
          currency: entreprise?.devise || "XOF",
          num_items: 1,
        }, { eventID: `commande-${idNouvelleCommande}` });
        envoyerEvenementCapi(idNouvelleCommande);
      }
    } catch (_) {}
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
