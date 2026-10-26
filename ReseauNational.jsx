// =====================================================================
// RecuVente — Module « Réseau national » : point d'entrée
//
//   • AdminReseau   → onglet « Réseau national » dans App.jsx
//   • RouteurReseau → pages publiques (branchées dans main.jsx) :
//        ?reseau=<slug>                        boutique client (catalogue, panier, suivi)
//        ?reseau=<slug>&espace=representant    espace représentant
// =====================================================================
import React from "react";
import BoutiqueReseau from "./ReseauBoutique.jsx";
import EspaceRepresentant from "./ReseauRepresentant.jsx";
import AdminReseau from "./ReseauAdmin.jsx";

export { BoutiqueReseau, EspaceRepresentant, AdminReseau };

export const lienBoutiqueReseau = (slug) => `${window.location.origin}/?reseau=${encodeURIComponent(slug || "")}`;
export const lienEspaceRepresentant = (slug) => `${lienBoutiqueReseau(slug)}&espace=representant`;

export default function RouteurReseau({ supabase }) {
  const q = new URLSearchParams(window.location.search);
  const slug = q.get("reseau");
  if (!slug) return null;
  if (q.get("espace") === "representant") return <EspaceRepresentant supabase={supabase} slug={slug} />;
  return <BoutiqueReseau supabase={supabase} slug={slug} />;
}
