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

  // Vérifie que la personne qui appelle est bien connectée et membre de l'espace concerné
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Session invalide" });

  const { data: commande, error: erreurCommande } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, tel, montant, statut, confirmed_at")
    .eq("id", commandeId)
    .single();

  if (erreurCommande || !commande) return res.status(404).json({ error: "Commande introuvable" });

  const { data: membership } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", commande.workspace_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership) return res.status(403).json({ error: "Accès refusé" });

  const { data: workspace, error: erreurWorkspace } = await supabaseAdmin
    .from("workspaces")
    .select("facebook_pixel_id, facebook_capi_token, currency")
    .eq("id", commande.workspace_id)
    .single();

  if (erreurWorkspace || !workspace?.facebook_pixel_id || !workspace?.facebook_capi_token) {
    // Pas de pixel/token configuré pour cet espace — on ignore silencieusement, ce n'est pas une erreur
    return res.status(200).json({ envoye: false, raison: "Pixel Facebook ou token Conversions API non configuré" });
  }

  const evenement = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(commande.confirmed_at || Date.now()).getTime() / 1000),
    action_source: "system_generated",
    event_id: `commande-${commande.id}`,
    user_data: {
      ph: [hasher(normaliserTelephone(commande.tel))].filter(Boolean),
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

    return res.status(200).json({ envoye: true, resultatFacebook });
  } catch (e) {
    return res.status(500).json({ envoye: false, error: e.message });
  }
}
