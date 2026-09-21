// Petits outils partagés (hors du dossier api/ : l'offre gratuite de Vercel limite le nombre de fonctions).
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function urlApp() {
  return String(process.env.APP_URL || "https://recuvente-saas.vercel.app").replace(/\/+$/, "");
}

export async function lireOption(workspaceId, cle) {
  const { data } = await supabaseAdmin.from("workspace_options").select("valeur").eq("workspace_id", workspaceId).eq("cle", cle).maybeSingle();
  return data?.valeur ?? null;
}

export async function ecrireOption(workspaceId, cle, valeur) {
  const { error } = await supabaseAdmin
    .from("workspace_options")
    .upsert([{ workspace_id: workspaceId, cle, valeur, updated_at: new Date().toISOString() }], { onConflict: "workspace_id,cle" });
  if (error) throw new Error(error.message);
}

// Petite limite en mémoire (valable pour l'instance serveur en cours) contre les abus sur les points d'entrée publics.
const compteurs = new Map();
export function tropDeRequetes(ip, nom, max, fenetreMs = 60000) {
  const tranche = Math.floor(Date.now() / fenetreMs);
  const cle = `${nom}:${ip}:${tranche}`;
  const n = (compteurs.get(cle) || 0) + 1;
  compteurs.set(cle, n);
  if (compteurs.size > 5000) compteurs.clear();
  return n > max;
}

export function ipDe(req) {
  return (String(req.headers?.["x-forwarded-for"] || "").split(",")[0] || "").trim() || "inconnue";
}

// Rôle du membre dans l'espace ("owner", "admin"…) ou null s'il n'en fait pas partie.
export async function roleMembre(userId, workspaceId) {
  const { data } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? data.role || "member" : null;
}
