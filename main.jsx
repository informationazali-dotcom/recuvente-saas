import "./premium-landing-overrides.css";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { EcranAmorce, cleBoutiqueDepuisUrl, lireIdentiteCachee, chemincourtDepuisUrl, produitDepuisCheminDomainePerso } from "./AmorceBoutique.jsx";

const App = lazy(() => import("./App.jsx"));
const SuiviPublic = lazy(() => import("./SuiviPublic.jsx"));
const CommanderPublic = lazy(() => import("./CommanderPublic.jsx"));
const MenuPublic = lazy(() => import("./MenuPublic.jsx"));
const importerCatalogue = () => import("./CataloguePublic.jsx");
const CataloguePublic = lazy(importerCatalogue);
const MarketingPublicTracker = lazy(() => import("./MarketingPublicTracker.jsx"));
const MarketingCODDashboard = lazy(() => import("./MarketingCODDashboard.jsx"));
const AnnuairePublic = lazy(() => import("./AnnuairePublic.jsx"));
const OutilsPublic = lazy(() => import("./OutilsPublic.jsx"));
const ReservationPublique = lazy(() => import("./ReservationPublique.jsx"));
const FichePublique = lazy(() => import("./FichePublique.jsx"));

// LOT DIGITAL — couche strictement additive : aucun module existant n'est remplacé.
const DigitalCommerce = lazy(() => import("./DigitalCommerce.jsx"));
const DigitalAccess = lazy(() => import("./DigitalAccess.jsx"));

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
try {
  const codeAmb = (params.get("amb") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  if (codeAmb) localStorage.setItem("rv_amb", JSON.stringify({ code: codeAmb, t: Date.now() }));
} catch (_) {}

const suiviId = params.get("suivi");
const commanderId = params.get("commander");
const catalogueId = params.get("catalogue");
const boutiqueSlug = params.get("boutique");
const marketingId = params.get("marketing");
const pageAnnuaire = params.get("annuaire") === "1";
const pageOutils = params.get("outils") === "1";
const slugLocation = params.get("location");
const ficheId = params.get("fiche");
const ficheType = params.get("type");
const menuSlug = params.get("menu");
const menuWorkspaceId = params.get("menu_id");
const menuTable = params.get("table");
const menuSuiviId = params.get("suivi_menu");

// LOT DIGITAL :
// ?digital=1          -> espace marchand Produits numériques
// ?digital_product=UUID -> page publique d'un produit numérique
// ?digital_access=1  -> espace client après paiement
const digitalAdmin = params.get("digital") === "1";
const digitalProductId = params.get("digital_product");
const digitalAccess = params.get("digital_access") === "1";

const DOMAINES_INTERNES = ["recuvente-saas.vercel.app", "localhost", "127.0.0.1"];
const hostname = window.location.hostname;
const estDomainePersonnalise = !DOMAINES_INTERNES.includes(hostname) && !hostname.endsWith(".vercel.app");

const cheminCourt = !estDomainePersonnalise && !suiviId && !commanderId && !catalogueId && !boutiqueSlug && !marketingId && !pageAnnuaire && !pageOutils && !slugLocation && !menuSlug && !menuWorkspaceId && !ficheId && !digitalAdmin && !digitalProductId && !digitalAccess
  ? chemincourtDepuisUrl()
  : null;

const estVueAdmin = !suiviId && !commanderId && !catalogueId && !boutiqueSlug && !marketingId && !pageAnnuaire && !pageOutils && !slugLocation && !menuSlug && !menuWorkspaceId && !ficheId && !digitalAdmin && !digitalProductId && !digitalAccess && !estDomainePersonnalise && !cheminCourt;
if (estVueAdmin) document.body.classList.add("rv-admin-app");

if (catalogueId || boutiqueSlug || estDomainePersonnalise || cheminCourt) importerCatalogue();
if (estVueAdmin) chargerSentry();
else window.addEventListener("load", () => setTimeout(chargerSentry, 2000));

const cleShop = cleBoutiqueDepuisUrl();
const identiteCachee = lireIdentiteCachee(cleShop);

function ChargementInitial() {
  if (cleShop) return <EcranAmorce identite={identiteCachee} />;
  return <div style={{ minHeight: "100vh", background: "#FAFAF7" }} />;
}

const ERREUR_VERSION = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|ChunkLoadError|Expected a JavaScript(-or-Wasm)? module script|Unable to preload CSS/i;
function rechargerPourNouvelleVersion() {
  try {
    const derniere = Number(sessionStorage.getItem("rv_rechargement_version") || 0);
    if (Date.now() - derniere < 60000) return false;
    sessionStorage.setItem("rv_rechargement_version", String(Date.now()));
  } catch (_) {}
  window.location.reload();
  return true;
}
window.addEventListener("vite:preloadError", (e) => { if (rechargerPourNouvelleVersion() && e && e.preventDefault) e.preventDefault(); });
window.addEventListener("unhandledrejection", (e) => { if (ERREUR_VERSION.test(String(e?.reason?.message || e?.reason || ""))) rechargerPourNouvelleVersion(); });

class ErreurBoundary extends React.Component {
  constructor(props) { super(props); this.state = { erreur: false }; }
  static getDerivedStateFromError() { return { erreur: true }; }
  componentDidCatch(erreur, info) {
    if (ERREUR_VERSION.test(String(erreur?.message || erreur || "")) && rechargerPourNouvelleVersion()) return;
    chargerSentry().then((S) => { if (S) S.captureException(erreur, { contexts: { react: { componentStack: info && info.componentStack } } }); }).catch(() => {});
  }
  render() { return this.state.erreur ? <ErreurFallback /> : this.props.children; }
}

function PublicTracker({ workspaceId, domaine, slug }) { return <MarketingPublicTracker workspaceId={workspaceId} domaine={domaine} slug={slug} />; }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErreurBoundary>
      <Suspense fallback={<ChargementInitial />}>
        {digitalAdmin ? <DigitalCommerce /> :
         digitalProductId ? <DigitalCommerce publicProductId={digitalProductId} /> :
         digitalAccess ? <DigitalAccess /> :
         pageAnnuaire ? <AnnuairePublic /> :
         pageOutils ? <OutilsPublic /> :
         ficheId ? <FichePublique ficheId={ficheId} typeEntite={ficheType} /> :
         slugLocation ? <ReservationPublique slug={slugLocation} /> :
         menuSlug ? <MenuPublic slug={menuSlug} tableParam={menuTable} suiviId={menuSuiviId} /> :
         menuWorkspaceId ? <MenuPublic workspaceId={menuWorkspaceId} tableParam={menuTable} suiviId={menuSuiviId} /> :
         marketingId ? <MarketingCODDashboard /> :
         suiviId ? <SuiviPublic commandeId={suiviId} /> :
         commanderId ? <><PublicTracker workspaceId={commanderId} /><CommanderPublic workspaceId={commanderId} /></> :
         catalogueId ? <><PublicTracker workspaceId={catalogueId} /><CataloguePublic workspaceId={catalogueId} /></> :
         boutiqueSlug ? <><PublicTracker slug={boutiqueSlug} /><CataloguePublic slug={boutiqueSlug} /></> :
         cheminCourt ? <><PublicTracker slug={cheminCourt.boutique} /><CataloguePublic slug={cheminCourt.boutique} produitSlugInitial={cheminCourt.produit} /></> :
         estDomainePersonnalise ? <><PublicTracker domaine={hostname} /><CataloguePublic domaine={hostname} produitSlugInitial={produitDepuisCheminDomainePerso()} /></> :
         <App />}
      </Suspense>
    </ErreurBoundary>
  </React.StrictMode>
);

function ErreurFallback() {
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 20, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 10 }}>😕</div><div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Une erreur est survenue</div><div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>L'équipe technique a été automatiquement notifiée.</div><button onClick={() => window.location.reload()} style={{ background: "#1a7a3c", color: "white", border: "none", padding: "10px 20px", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Recharger la page</button></div>;
}
