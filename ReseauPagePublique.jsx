// Pages publiques du réseau national, chargées à la demande depuis main.jsx
// (le client Supabase n'est téléchargé que par les visiteurs de ces pages).
import React from "react";
import { supabase } from "./supabaseClient";
import RouteurReseau from "./ReseauNational.jsx";

export default function PagePubliqueReseau() {
  return <RouteurReseau supabase={supabase} />;
}
