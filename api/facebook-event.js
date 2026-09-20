import { createClient } from "@supabase/supabase-js";

// ============================================================================
//  Événements d'entonnoir envoyés à Facebook PAR LE SERVEUR (Conversions API) :
//  ViewContent, AddToCart, InitiateCheckout.
//
//  Pourquoi : le Pixel du navigateur est souvent bloqué ou retardé (iPhone, navigateur
//  intégré de Facebook/Instagram, bloqueurs de publicités, réseau lent). Shopify envoie
//  ces événements côté serveur en plus du navigateur ; sans cela Facebook « voit » moins
//  de visiteurs qu'il n'y en a vraiment et optimise moins bien les publicités.
//
//  Le même event_id est envoyé par le navigateur et par ce serveur : Meta ne compte donc
//  l'événement qu'une seule fois (déduplication). L'achat (Purchase) a son propre fichier :
//  api/facebook-capi.js, inchangé.
// ============================================================================

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EVENEMENTS_AUTORISES = new Set(["ViewContent", "AddToCart", "InitiateCheckout"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Petites protections en mémoire (valables pour l'instance serveur en cours) :
// - la config Facebook d'une boutique est gardée 60 s (évite une lecture de base par événement) ;
// - un même visiteur (IP) est limité à 90 événements par minute (anti-abus).
const cacheWorkspace = new Map();
const compteurs = new Map();

async function lireWorkspace(id) {
  const en_cache = cacheWorkspace.get(id);
  if (en_cache && Date.now() - en_cache.t < 60000) return en_cache.v;
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("facebook_pixel_id, facebook_capi_token, currency")
    .eq("id", id)
    .maybeSingle();
  cacheWorkspace.set(id, { t: Date.now(), v: data || null });
  if (cacheWorkspace.size > 500) cacheWorkspace.clear();
  return data || null;
}

function tropDeRequetes(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const cle = `${ip}:${minute}`;
  const n = (compteurs.get(cle) || 0) + 1;
  compteurs.set(cle, n);
  if (compteurs.size > 5000) compteurs.clear();
  return n > 90;
}

const texte = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);

// Ne garde que des champs attendus, aux bons formats : ce point d'entrée est public,
// rien de ce qui arrive du navigateur n'est transmis tel quel à Facebook.
export function nettoyerParametres(brut, devisePareDefaut) {
  const p = brut && typeof brut === "object" ? brut : {};
  const out = {};
  const valeur = Number(p.value);
  if (Number.isFinite(valeur) && valeur >= 0 && valeur < 1e10) out.value = valeur;
  const devise = typeof p.currency === "string" && /^[A-Za-z]{3}$/.test(p.currency) ? p.currency.toUpperCase() : devisePareDefaut || "XOF";
  out.currency = devise;
  out.content_type = "product";
  const nom = texte(p.content_name, 200);
  if (nom) out.content_name = nom;
  if (Array.isArray(p.content_ids)) {
    const ids = p.content_ids.filter((x) => typeof x === "string" && x.length <= 64).slice(0, 20);
    if (ids.length) out.content_ids = ids;
  }
  if (Array.isArray(p.contents)) {
    const contenus = p.contents
      .filter((c) => c && typeof c.id === "string" && c.id.length <= 64)
      .slice(0, 20)
      .map((c) => ({ id: c.id, quantity: Math.max(1, Math.min(999, Number(c.quantity) || 1)), item_price: Math.max(0, Number(c.item_price) || 0) }));
    if (contenus.length) out.contents = contenus;
  }
  const nb = Number(p.num_items);
  if (Number.isFinite(nb) && nb >= 1 && nb <= 999) out.num_items = Math.round(nb);
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const corps = req.body && typeof req.body === "object" ? req.body : {};
  const { workspaceId, nom, eventId } = corps;

  if (!EVENEMENTS_AUTORISES.has(nom)) return res.status(400).json({ error: "Événement non autorisé" });
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) return res.status(400).json({ error: "Boutique invalide" });
  if (typeof eventId !== "string" || eventId.length < 6 || eventId.length > 80) return res.status(400).json({ error: "eventId invalide" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || undefined;
  if (tropDeRequetes(ip || "inconnue")) return res.status(429).json({ error: "Trop de requêtes" });

  try {
    const workspace = await lireWorkspace(workspaceId);
    if (!workspace?.facebook_pixel_id || !workspace?.facebook_capi_token) {
      // Pas de Pixel ou pas de jeton Conversions API pour cette boutique : rien à faire.
      return res.status(200).json({ envoye: false, raison: "Conversions API non configurée" });
    }

    const evenement = {
      event_name: nom,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_id: eventId,
      event_source_url: texte(corps.url, 500),
      user_data: {
        client_ip_address: ip,
        client_user_agent: texte(req.headers["user-agent"], 500),
        fbp: texte(corps.fbp, 120) || undefined,
        fbc: texte(corps.fbc, 200) || undefined,
      },
      custom_data: nettoyerParametres(corps.params, workspace.currency),
    };

    const reponse = await fetch(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(workspace.facebook_pixel_id)}/events?access_token=${encodeURIComponent(workspace.facebook_capi_token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: [evenement] }) }
    );
    if (!reponse.ok) {
      const detail = await reponse.json().catch(() => ({}));
      return res.status(200).json({ envoye: false, error: detail?.error?.message || "Erreur Facebook" });
    }
    return res.status(200).json({ envoye: true });
  } catch (e) {
    // Un événement perdu n'est jamais bloquant pour le client.
    return res.status(200).json({ envoye: false, error: e.message });
  }
}
