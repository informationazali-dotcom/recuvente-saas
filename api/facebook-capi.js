import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hasher(valeur) {
  if (!valeur) return null;
  return crypto.createHash("sha256").update(String(valeur).trim().toLowerCase()).digest("hex");
}

function normaliserTelephone(tel) {
  let chiffres = String(tel || "").replace(/\D/g, "");
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  if (!chiffres.startsWith("225") && chiffres.length <= 10) chiffres = "225" + chiffres.replace(/^0/, "");
  return "+" + chiffres;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { commandeId } = req.body;
  if (!commandeId) return res.status(400).json({ error: "commandeId manquant" });

  const { data: commande, error: erreurCommande } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, tel, montant, statut, created_at, confirmed_at, purchase_event_envoye, fb_fbp, fb_fbc, fb_user_agent, fb_event_source_url")
    .eq("id", commandeId)
    .single();

  if (erreurCommande || !commande) return res.status(404).json({ error: "Commande introuvable" });

  // Deux façons légitimes d'appeler cette fonction :
  // 1. Depuis le tableau de bord (admin connecté) — utilisé comme filet de sécurité au moment
  //    de la confirmation, si l'envoi immédiat a échoué pour une raison ou une autre.
  // 2. Depuis la boutique publique, SANS session (le client n'est jamais connecté) — c'est le
  //    déclenchement principal, juste après la commande, façon Shopify : Facebook apprend vite.
  //    Pour rester sûr sans authentification, on exige que la commande soit toute récente
  //    (moins de 10 minutes) — impossible à deviner/rejouer plus tard pour quelqu'un d'externe.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (token) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) return res.status(401).json({ error: "Session invalide" });
    const { data: membership } = await supabaseAdmin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", commande.workspace_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!membership) return res.status(403).json({ error: "Accès refusé" });
  } else {
    const ageMinutes = (Date.now() - new Date(commande.created_at).getTime()) / 60000;
    if (ageMinutes > 10) return res.status(403).json({ error: "Commande trop ancienne pour un envoi non authentifié" });
  }

  // Jamais deux fois le même achat envoyé à Facebook, peu importe combien de fois cette
  // fonction est appelée pour cette commande (immédiat + filet de sécurité à la confirmation).
  if (commande.purchase_event_envoye) {
    return res.status(200).json({ envoye: false, raison: "Déjà envoyé précédemment pour cette commande" });
  }

  const { data: workspace, error: erreurWorkspace } = await supabaseAdmin
    .from("workspaces")
    .select("facebook_pixel_id, facebook_capi_token, currency")
    .eq("id", commande.workspace_id)
    .single();

  if (erreurWorkspace || !workspace?.facebook_pixel_id || !workspace?.facebook_capi_token) {
    // Pas de pixel/token configuré pour cet espace — on ignore silencieusement, ce n'est pas une erreur
    return res.status(200).json({ envoye: false, raison: "Pixel Facebook ou token Conversions API non configuré" });
  }

  // fbp/fbc/user_agent/event_source_url permettent à Facebook de relier précisément cet achat
  // à la publicité qui l'a généré — sans ça, l'optimisation des pubs est très limitée.
  const evenement = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(commande.created_at || Date.now()).getTime() / 1000),
    action_source: "website",
    event_id: `commande-${commande.id}`,
    event_source_url: commande.fb_event_source_url || undefined,
    user_data: {
      ph: [hasher(normaliserTelephone(commande.tel))].filter(Boolean),
      client_user_agent: commande.fb_user_agent || undefined,
      fbp: commande.fb_fbp || undefined,
      fbc: commande.fb_fbc || undefined,
    },
    custom_data: {
      value: Number(commande.montant),
      currency: workspace.currency || "XOF",
    },
  };

  try {
    const reponseFacebook = await fetch(
      `https://graph.facebook.com/v19.0/${workspace.facebook_pixel_id}/events?access_token=${workspace.facebook_capi_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [evenement] }),
      }
    );
    const resultatFacebook = await reponseFacebook.json();

    if (!reponseFacebook.ok) {
      return res.status(400).json({ envoye: false, error: resultatFacebook.error?.message || "Erreur Facebook" });
    }

    await supabaseAdmin.from("commandes").update({ purchase_event_envoye: true }).eq("id", commande.id);

    return res.status(200).json({ envoye: true, resultatFacebook });
  } catch (e) {
    return res.status(500).json({ envoye: false, error: e.message });
  }
}
