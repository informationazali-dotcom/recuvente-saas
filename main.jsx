import "./premium-landing-overrides.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";

const App = lazy(() => import("./App.jsx"));
const SuiviPublic = lazy(() => import("./SuiviPublic.jsx"));
const CommanderPublic = lazy(() => import("./CommanderPublic.jsx"));
const CataloguePublic = lazy(() => import("./CataloguePublic.jsx"));
const MarketingPublicTracker = lazy(() => import("./MarketingPublicTracker.jsx"));
const MarketingCODDashboard = lazy(() => import("./MarketingCODDashboard.jsx"));

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: "production", tracesSampleRate: 0.2 });
}

const params = new URLSearchParams(window.location.search);
const suiviId = params.get("suivi");
const commanderId = params.get("commander");
const catalogueId = params.get("catalogue");
// Lien standard généré par le Store Builder (« ?boutique=mon-slug ») — il manquait ici,
// donc ces liens tombaient dans la vue admin ci-dessous, qui chargeait tout le tableau
// de bord (plus lourd) avant de rediriger en interne vers la boutique. Fini.
const boutiqueSlug = params.get("boutique");
const marketingId = params.get("marketing");
const DOMAINES_INTERNES = ["recuvente-saas.vercel.app", "localhost", "127.0.0.1"];
const hostname = window.location.hostname;
const estDomainePersonnalise = !DOMAINES_INTERNES.includes(hostname) && !hostname.endsWith(".vercel.app");
const estVueAdmin = !suiviId && !commanderId && !catalogueId && !boutiqueSlug && !marketingId && !estDomainePersonnalise;
if (estVueAdmin) document.body.classList.add("rv-admin-app");

function ChargementInitial() {
  // Neutre à dessein : ni logo, ni couleur de marque RecuVente, pour que rien ne
  // "flashe" avant que la boutique (ou l'admin) n'affiche sa propre identité.
  return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
}

function PublicTracker({ workspaceId, domaine }) { return <MarketingPublicTracker workspaceId={workspaceId} domaine={domaine} />; }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErreurFallback />} showDialog={false}>
      <Suspense fallback={<ChargementInitial />}>
        {marketingId ? <MarketingCODDashboard /> : suiviId ? <SuiviPublic commandeId={suiviId} /> : commanderId ? <><PublicTracker workspaceId={commanderId} /><CommanderPublic workspaceId={commanderId} /></> : catalogueId ? <><PublicTracker workspaceId={catalogueId} /><CataloguePublic workspaceId={catalogueId} /></> : boutiqueSlug ? <CataloguePublic slug={boutiqueSlug} /> : estDomainePersonnalise ? <><PublicTracker domaine={hostname} /><CataloguePublic domaine={hostname} /></> : <App />}
      </Suspense>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

function ErreurFallback() {
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>😕</div><div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Une erreur est survenue</div><div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>L'équipe technique a été automatiquement notifiée.</div><button onClick={() => window.location.reload()} style={{ background: "#1a7a3c", color: "white", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Recharger la page</button></div>;
}
