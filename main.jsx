import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.jsx";
import SuiviPublic from "./SuiviPublic.jsx";
import CommanderPublic from "./CommanderPublic.jsx";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
  });
}

const suiviId = new URLSearchParams(window.location.search).get("suivi");
const commanderId = new URLSearchParams(window.location.search).get("commander");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErreurFallback />} showDialog={false}>
      {suiviId ? <SuiviPublic commandeId={suiviId} /> : commanderId ? <CommanderPublic workspaceId={commanderId} /> : <App />}
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

function ErreurFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>😕</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Une erreur est survenue</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>L'équipe technique a été automatiquement notifiée.</div>
      <button onClick={() => window.location.reload()} style={{ background: "#1a7a3c", color: "white", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>
        Recharger la page
      </button>
    </div>
  );
}
