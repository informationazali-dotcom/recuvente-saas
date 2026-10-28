// =====================================================================
// RecuVente — Module « Réseau national » : point d'entrée
//
//   • AdminReseau   → onglet « Réseau national » dans App.jsx
//   • RouteurReseau → pages publiques (branchées dans main.jsx) :
//        ?reseau=<slug>                        boutique client (catalogue, panier, suivi)
//        ?reseau=<slug>&espace=representant    espace représentant
//        ?reseau=<slug>&espace=vendeur         espace vendeur partenaire
// =====================================================================
import React from "react";
import BoutiqueReseau from "./ReseauBoutique.jsx";
import EspaceRepresentant from "./ReseauRepresentant.jsx";
import EspaceVendeur from "./ReseauVendeur.jsx";
import AdminReseau from "./ReseauAdmin.jsx";

export { BoutiqueReseau, EspaceRepresentant, EspaceVendeur, AdminReseau };

// Adresses courtes (recuvente-saas.vercel.app/excellence) — à garder identique à main.jsx
export const CHEMINS_RESEAU = { excellence: "miss-mister-excellence", guides: "miss-mister-excellence" };

export const lienBoutiqueReseau = (slug) => `${window.location.origin}/?reseau=${encodeURIComponent(slug || "")}`;
export const lienEspaceRepresentant = (slug) => `${lienBoutiqueReseau(slug)}&espace=representant`;
export const lienEspaceVendeur = (slug) => `${lienBoutiqueReseau(slug)}&espace=vendeur`;

export default function RouteurReseau({ supabase }) {
  const q = new URLSearchParams(window.location.search);
  const slug = q.get("reseau") || CHEMINS_RESEAU[window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase()];
  if (!slug) return null;
  if (q.get("espace") === "representant") return <EspaceRepresentant supabase={supabase} slug={slug} />;
  if (q.get("espace") === "vendeur") return <EspaceVendeur supabase={supabase} slug={slug} />;
  return <BoutiqueReseau supabase={supabase} slug={slug} />;
}
