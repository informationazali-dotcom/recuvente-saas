import "./premium-landing-overrides.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";

// Chargement à la demande : chaque route ne télécharge QUE le code dont elle a besoin.
const App = lazy(() => import("./App.jsx"));
const SuiviPublic = lazy(() => import("./SuiviPublic.jsx"));
const CommanderPublic = lazy(() => import("./CommanderPublic.jsx"));
const CataloguePublic = lazy(() => import("./CataloguePublic.jsx"));

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
  });
}

const suiviId = new URLSearchParams(window.location.search).get("suivi");
const commanderId = new URLSearchParams(window.location.search).get("commander");
const catalogueId = new URLSearchParams(window.location.search).get("catalogue");
const DOMAINES_INTERNES = ["recuvente-saas.vercel.app", "localhost", "127.0.0.1"];
const hostname = window.location.hostname;
const estDomainePersonnalise = !DOMAINES_INTERNES.includes(hostname) && !hostname.endsWith(".vercel.app");
const estVueAdmin = !suiviId && !commanderId && !catalogueId && !estDomainePersonnalise;
if (estVueAdmin) document.body.classList.add("rv-admin-app");

function ChargementInitial() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid #ECE8DC", borderTopColor: "#1a7a3c", animation: "rvSpin 0.7s linear infinite" }} />
      <style>{`@keyframes rvSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErreurFallback />} showDialog={false}>
      <Suspense fallback={<ChargementInitial />}>
        {suiviId ? <SuiviPublic commandeId={suiviId} /> : commanderId ? <CommanderPublic workspaceId={commanderId} /> : catalogueId ? <CataloguePublic workspaceId={catalogueId} /> : estDomainePersonnalise ? <CataloguePublic domaine={hostname} /> : <App />}
      </Suspense>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

function ErreurFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>😕</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Une erreur est survenue</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>L'équipe technique a été automatiquement notifiée.</div>
      <button onClick={() => window.location.reload()} style={{ background: "#1a7a3c", color: "white", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Recharger la page</button>
    </div>
  );
}
