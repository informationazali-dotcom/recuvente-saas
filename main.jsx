import "./premium-landing-overrides.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { EcranAmorce, cleBoutiqueDepuisUrl, lireIdentiteCachee } from "./AmorceBoutique.jsx";

const App = lazy(() => import("./App.jsx"));
const SuiviPublic = lazy(() => import("./SuiviPublic.jsx"));
const CommanderPublic = lazy(() => import("./CommanderPublic.jsx"));
const importerCatalogue = () => import("./CataloguePublic.jsx");
const CataloguePublic = lazy(importerCatalogue);
const MarketingPublicTracker = lazy(() => import("./MarketingPublicTracker.jsx"));
const MarketingCODDashboard = lazy(() => import("./MarketingCODDashboard.jsx"));

// Sentry (suivi d'erreurs) n'est plus dans le premier téléchargement : c'est une bibliothèque
// lourde, inutile pour afficher la boutique. Il se charge juste après l'affichage (tout de suite
// pour l'administrateur). Le comportement est le même, seul le moment du chargement change.
let promesseSentry = null;
function chargerSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return Promise.resolve(null);
  if (!promesseSentry) {
    promesseSentry = import("@sentry/react")
      .then((S) => { S.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: "production", tracesSampleRate: 0.2 }); return S; })
      .catch(() => null);
  }
  return promesseSentry;
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
// Boutique publique : on demande le code de la boutique tout de suite, sans attendre le premier affichage.
if (catalogueId || boutiqueSlug || estDomainePersonnalise) importerCatalogue();
// Sentry : immédiatement pour l'admin, un peu après le chargement pour les visiteurs.
if (estVueAdmin) chargerSentry();
else window.addEventListener("load", () => setTimeout(chargerSentry, 2000));

// Boutique demandée par l'URL (null = admin / suivi / marketing) et son identité gardée en cache.
const cleShop = cleBoutiqueDepuisUrl();
const identiteCachee = lireIdentiteCachee(cleShop);

function ChargementInitial() {
  // Aux couleurs de la boutique si on la connaît déjà (identique à l'amorce posée par
  // index.html → aucune rupture), sinon écran neutre. Jamais de marque RecuVente ici.
  if (cleShop) return <EcranAmorce identite={identiteCachee} />;
  return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
}

class ErreurBoundary extends React.Component {
  constructor(props) { super(props); this.state = { erreur: false }; }
  static getDerivedStateFromError() { return { erreur: true }; }
  componentDidCatch(erreur, info) {
    chargerSentry().then((S) => { if (S) S.captureException(erreur, { contexts: { react: { componentStack: info && info.componentStack } } }); }).catch(() => {});
  }
  render() { return this.state.erreur ? <ErreurFallback /> : this.props.children; }
}

function PublicTracker({ workspaceId, domaine, slug }) { return <MarketingPublicTracker workspaceId={workspaceId} domaine={domaine} slug={slug} />; }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErreurBoundary>
      <Suspense fallback={<ChargementInitial />}>
        {marketingId ? <MarketingCODDashboard /> : suiviId ? <SuiviPublic commandeId={suiviId} /> : commanderId ? <><PublicTracker workspaceId={commanderId} /><CommanderPublic workspaceId={commanderId} /></> : catalogueId ? <><PublicTracker workspaceId={catalogueId} /><CataloguePublic workspaceId={catalogueId} /></> : boutiqueSlug ? <><PublicTracker slug={boutiqueSlug} /><CataloguePublic slug={boutiqueSlug} /></> : estDomainePersonnalise ? <><PublicTracker domaine={hostname} /><CataloguePublic domaine={hostname} /></> : <App />}
      </Suspense>
    </ErreurBoundary>
  </React.StrictMode>
);

function ErreurFallback() {
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>😕</div><div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Une erreur est survenue</div><div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>L'équipe technique a été automatiquement notifiée.</div><button onClick={() => window.location.reload()} style={{ background: "#1a7a3c", color: "white", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Recharger la page</button></div>;
}
