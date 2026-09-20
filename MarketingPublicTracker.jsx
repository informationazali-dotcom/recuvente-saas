import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

function uuid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readMetaCookie(name) {
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export default function MarketingPublicTracker({ workspaceId, domaine, slug }) {
  useEffect(() => {
    let cancelled = false;
    async function start() {
      let resolvedWorkspaceId = workspaceId || null;
      if (!resolvedWorkspaceId && domaine) {
        const { data } = await supabase.rpc("workspace_id_par_domaine", { p_domaine: domaine });
        resolvedWorkspaceId = data || null;
      }
      // Lien de boutique « ?boutique=mon-slug » (le format de lien le plus courant) : auparavant
      // aucune session marketing n'y était enregistrée, donc le rapport Marketing COD restait vide
      // pour ces boutiques. On réutilise le préchargement de index.html s'il existe (aucune requête en plus).
      if (!resolvedWorkspaceId && slug) {
        try {
          const pre = window.__RV_PRE;
          if (pre && pre.ws && pre.cle === slug && pre.fn === "slug") resolvedWorkspaceId = (await Promise.resolve(pre.ws)) || null;
        } catch (_) {}
        if (!resolvedWorkspaceId) {
          const { data } = await supabase.rpc("workspace_id_par_slug", { p_slug: slug });
          resolvedWorkspaceId = data || null;
        }
      }
      if (!resolvedWorkspaceId || cancelled) return;

      const params = new URLSearchParams(window.location.search);
      const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem("rv_marketing_attribution") || "{}"); } catch (_) {}
      const attribution = { ...stored };
      keys.forEach((key) => { const value = params.get(key); if (value) attribution[key] = value; });
      try { localStorage.setItem("rv_marketing_attribution", JSON.stringify(attribution)); } catch (_) {}

      let visitorId = null;
      let sessionId = null;
      try {
        visitorId = localStorage.getItem("rv_marketing_visitor_id") || uuid();
        sessionId = sessionStorage.getItem("rv_marketing_session_id") || uuid();
        localStorage.setItem("rv_marketing_visitor_id", visitorId);
        sessionStorage.setItem("rv_marketing_session_id", sessionId);
      } catch (_) {}
      if (!visitorId || !sessionId) return;

      const fbp = readMetaCookie("_fbp");
      const fbclid = params.get("fbclid");
      const fbc = readMetaCookie("_fbc") || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);
      const landingPage = `${window.location.pathname}${window.location.search}`;

      await supabase.rpc("enregistrer_session_marketing_publique", {
        p_workspace_id: resolvedWorkspaceId,
        p_session_id: sessionId,
        p_visitor_id: visitorId,
        p_source: attribution.utm_source || null,
        p_medium: attribution.utm_medium || null,
        p_campaign: attribution.utm_campaign || null,
        p_content: attribution.utm_content || null,
        p_term: attribution.utm_term || null,
        p_referrer_url: document.referrer || null,
        p_landing_page: landingPage,
        p_fbp: fbp,
        p_fbc: fbc,
        p_user_agent: navigator.userAgent,
      });

      // Le RPC de commande existant reçoit déjà window.location.href. On y transporte
      // l'identité de session/visiteur sans créer une nouvelle API ni casser l'ancienne signature.
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("rv_sid", sessionId);
        url.searchParams.set("rv_vid", visitorId);
        window.history.replaceState({}, "", url.toString());
      } catch (_) {}

      if (!cancelled) {
        await supabase.rpc("enregistrer_evenement_marketing_public", {
          p_workspace_id: resolvedWorkspaceId,
          p_event_name: "page_viewed",
          p_event_id: uuid(),
          p_session_id: sessionId,
          p_visitor_id: visitorId,
          p_metadata: { path: window.location.pathname },
        });
      }
    }
    start().catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId, domaine, slug]);

  return null;
}
