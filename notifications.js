import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure web-push avec la paire de clés VAPID (la clé publique doit être EXACTEMENT
// la même que celle utilisée côté client dans App.jsx, sinon les envois échouent).
webpush.setVapidDetails(
  "mailto:contact@recuvente.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


// ============================================================================
//  ALERTE « NOUVELLE VENTE » — notification push forte, façon Shopify.
//  Avant : le type « new_order » existait mais AUCUNE partie de l'application ne l'appelait
//  (aucune commande ne déclenchait donc de notification quand l'app était fermée).
//  Maintenant : la boutique publique (via facebook-capi.js et le type « nouvelle_commande »
//  ci-dessous) et le webhook Shopify appellent cette fonction dès qu'une commande arrive.
//  Le contenu du message vient TOUJOURS de la base de données, jamais du navigateur du
//  visiteur : personne ne peut faire afficher un texte de son choix sur ton téléphone.
// ============================================================================
const dejaNotifiees = new Map(); // id de commande -> heure (anti-doublon pendant que le serveur est chaud)

function libelleDevise(code) {
  const c = String(code || "").toUpperCase();
  if (c === "XOF" || c === "XAF" || !c) return "F CFA";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return c;
}

async function envoyerAuxAbonnements(abonnements, payload) {
  const contenu = JSON.stringify(payload);
  let envoyes = 0;
  const morts = [];
  const erreurs = [];
  await Promise.all(
    (abonnements || []).map(async (abo) => {
      try {
        await webpush.sendNotification(
          { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
          contenu,
          { urgency: "high", TTL: 60 * 60 * 6 } // « high » = livré tout de suite, même téléphone en veille
        );
        envoyes += 1;
      } catch (e) {
        erreurs.push({ statusCode: e.statusCode || null, message: e.message || String(e) });
        if (e.statusCode === 404 || e.statusCode === 410) morts.push(abo.endpoint);
      }
    })
  );
  if (morts.length > 0) await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", morts);
  return { envoyes, total: (abonnements || []).length, erreurs };
}

// Appareils à prévenir pour une boutique : ceux de l'espace ET ceux de ses membres (un propriétaire de
// plusieurs boutiques n'a qu'un appareil enregistré, rattaché à la dernière boutique où il a activé les alertes).
async function abonnementsWorkspace(workspaceId) {
  let abonnements = [];
  try {
    const { data: membres } = await supabaseAdmin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).limit(50);
    const emails = (
      await Promise.all((membres || []).map(async (m) => {
        try { const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id); return data?.user?.email || null; } catch (_) { return null; }
      }))
    ).filter((e) => e && !/["\\,()]/.test(e));
    const filtre = [`workspace_id.eq.${workspaceId}`, ...(emails.length ? [`user_email.in.(${emails.map((e) => `"${e}"`).join(",")})`] : [])].join(",");
    const { data } = await supabaseAdmin.from("push_subscriptions").select("*").or(filtre);
    abonnements = data || [];
  } catch (_) {}
  if (abonnements.length === 0) {
    const { data } = await supabaseAdmin.from("push_subscriptions").select("*").eq("workspace_id", workspaceId);
    abonnements = data || [];
  }
  return abonnements;
}

// Alerte « paiement reçu » : un client vient de payer sa commande en ligne (Mobile Money / carte).
export async function pousserPaiementRecu({ commande, montant, devise }) {
  try {
    if (!commande?.workspace_id) return { envoyes: 0 };
    const abonnements = await abonnementsWorkspace(commande.workspace_id);
    if (abonnements.length === 0) return { envoyes: 0, raison: "personne n'a activé les notifications" };
    const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency").eq("id", commande.workspace_id).maybeSingle();
    const somme = `${Number(montant).toLocaleString("fr-FR")} ${libelleDevise(devise || ws?.currency)}`;
    return await envoyerAuxAbonnements(abonnements, {
      title: `💳 Paiement reçu${ws?.name ? " — " + ws.name : ""} !`,
      body: [String(commande.client || "Un client").slice(0, 60), somme, "payé en ligne"].join(" • "),
      url: "/admin/",
      tag: `paiement-${commande.id}`,
      commandeId: commande.id,
      sound: true,
      ts: Date.now(),
    });
  } catch (e) {
    return { envoyes: 0, erreur: e.message };
  }
}

// ===== LOT 3 (location de maison) : rappel récapitulatif "X loyers en retard" au propriétaire =====
// Appelé par lib/loyers.js (cron quotidien), au plus une fois par jour et jamais pour zéro retard
// (ces deux garde-fous sont gérés côté appelant, via workspace_options).
export async function pousserRappelLoyers({ workspaceId, nbEnRetard, totalEnRetard }) {
  try {
    if (!workspaceId || !nbEnRetard) return { envoyes: 0 };
    const abonnements = await abonnementsWorkspace(workspaceId);
    if (abonnements.length === 0) return { envoyes: 0, raison: "personne n'a activé les notifications" };
    const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency").eq("id", workspaceId).maybeSingle();
    const somme = `${Number(totalEnRetard || 0).toLocaleString("fr-FR")} ${libelleDevise(ws?.currency)}`;
    return await envoyerAuxAbonnements(abonnements, {
      title: `🏠 ${nbEnRetard} loyer${nbEnRetard > 1 ? "s" : ""} en retard${ws?.name ? " — " + ws.name : ""}`,
      body: `${somme} à encaisser au total. Ouvre Locataires & loyers pour relancer.`,
      url: "/admin/",
      tag: `loyers-retard-${workspaceId}`,
      sound: true,
      ts: Date.now(),
    });
  } catch (e) {
    return { envoyes: 0, erreur: e.message };
  }
}

export async function pousserNouvelleCommande(commandeOuId) {
  try {
    let cmd = commandeOuId && typeof commandeOuId === "object" ? commandeOuId : null;
    const id = cmd ? cmd.id : commandeOuId;
    if (!id) return { envoyes: 0, raison: "id manquant" };
    const maintenant = Date.now();
    for (const [k, v] of dejaNotifiees) if (maintenant - v > 15 * 60 * 1000) dejaNotifiees.delete(k);
    if (dejaNotifiees.has(id)) return { envoyes: 0, raison: "déjà notifiée" };
    dejaNotifiees.set(id, maintenant);

    if (!cmd || cmd.produit === undefined) {
      const { data } = await supabaseAdmin.from("commandes").select("id, workspace_id, client, produit, montant, created_at").eq("id", id).maybeSingle();
      cmd = data;
    }
    if (!cmd) { dejaNotifiees.delete(id); return { envoyes: 0, raison: "commande introuvable" }; }

    const abonnements = await abonnementsWorkspace(cmd.workspace_id);
    if (abonnements.length === 0) return { envoyes: 0, raison: "personne n'a activé les notifications" };

    const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency").eq("id", cmd.workspace_id).maybeSingle();
    let produit = cmd.produit;
    if (!produit) {
      const { data: articles } = await supabaseAdmin.from("commande_items").select("produit_nom, quantite").eq("commande_id", cmd.id).limit(3);
      produit = (articles || []).map((a) => `${a.quantite > 1 ? a.quantite + "× " : ""}${a.produit_nom}`).join(", ");
    }
    const montant = Number(cmd.montant) > 0 ? `${Number(cmd.montant).toLocaleString("fr-FR")} ${libelleDevise(ws?.currency)}` : "";
    const payload = {
      title: `💰 Nouvelle commande${ws?.name ? " — " + ws.name : ""} !`,
      body: [String(cmd.client || "Un client").slice(0, 60), String(produit || "").slice(0, 90), montant].filter(Boolean).join(" • "),
      url: "/admin/",
      tag: `commande-${cmd.id}`,
      commandeId: cmd.id,
      sound: true,
      ts: Date.now(),
    };
    const r = await envoyerAuxAbonnements(abonnements, payload);
    return { ...r, ok: true };
  } catch (e) {
    return { envoyes: 0, erreur: e.message };
  }
}

// Vérifie la session (jeton Bearer) et l'appartenance à l'espace. Renvoie l'utilisateur ou null.
async function utilisateurMembre(req, workspaceId) {
  const token = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!token || !workspaceId) return null;
  const { data: u, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !u?.user) return null;
  const { data: m } = await supabaseAdmin.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", u.user.id).maybeSingle();
  return m ? u.user : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { type } = req.body || {};

  // ===== Email de bienvenue à la création d'un espace =====
  if (type === "welcome") {
    const { email, workspaceName } = req.body;
    // Envoi de l'email de bienvenue — comportement existant, inchangé.
    // (Si un vrai fournisseur d'email — Resend, SendGrid... — était déjà branché ici,
    // remets-le à cet endroit exact : cette section a été reconstruite de mémoire et
    // doit être vérifiée contre ton fichier réel avant déploiement.)
    console.log(`Email de bienvenue à envoyer à ${email} pour l'espace "${workspaceName}"`);
    return res.status(200).json({ ok: true });
  }

  // ===== Boutique publique (sans session) : une commande vient d'être passée =====
  // Sûr sans connexion : la commande doit exister ET dater de moins de 10 minutes (impossible à
  // deviner ou à rejouer plus tard), et le texte est lu dans la base, pas envoyé par le visiteur.
  if (type === "nouvelle_commande") {
    const { commandeId } = req.body || {};
    if (!commandeId || !/^[0-9a-f-]{36}$/i.test(String(commandeId))) return res.status(400).json({ error: "commandeId invalide" });
    const { data: cmd } = await supabaseAdmin.from("commandes").select("id, workspace_id, client, produit, montant, created_at").eq("id", commandeId).maybeSingle();
    if (!cmd) return res.status(404).json({ error: "Commande introuvable" });
    if ((Date.now() - new Date(cmd.created_at).getTime()) / 60000 > 10) return res.status(403).json({ error: "Commande trop ancienne" });
    const r = await pousserNouvelleCommande(cmd);
    return res.status(200).json({ ok: true, envoyes: r.envoyes || 0 });
  }

  // ===== Test : « Envoyer une notification test » depuis l'app (envoyée à MES appareils seulement) =====
  if (type === "test") {
    const { workspaceId } = req.body || {};
    const user = await utilisateurMembre(req, workspaceId);
    if (!user) return res.status(401).json({ error: "Session invalide ou accès refusé" });
    const { data: abos } = await supabaseAdmin.from("push_subscriptions").select("*").eq("user_email", user.email);
    if (!abos || abos.length === 0) return res.status(200).json({ ok: true, envoyes: 0, total: 0, message: "Aucun appareil enregistré pour ton compte." });
    const r = await envoyerAuxAbonnements(abos, {
      title: "💰 Nouvelle commande — TEST !",
      body: "Aminata K. • Sérum éclat ×2 • 25 000 F CFA",
      url: "/admin/",
      tag: `test-${Date.now()}`,
      sound: true,
      ts: Date.now(),
    });
    return res.status(200).json({ ok: true, ...r });
  }

  // ===== Notification push forte à l'arrivée d'une nouvelle commande =====
  // (ancien chemin : réservé désormais aux membres connectés de l'espace ; avant, n'importe qui
  //  connaissant l'identifiant public d'une boutique pouvait envoyer un message sur ses téléphones)
  if (type === "new_order") {
    const { workspaceId, client, produit, montant } = req.body;
    if (!workspaceId) return res.status(400).json({ error: "workspaceId manquant" });
    if (!(await utilisateurMembre(req, workspaceId))) return res.status(401).json({ error: "Session invalide ou accès refusé" });

    const { data: abonnements, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (error) return res.status(500).json({ error: error.message });
    if (!abonnements || abonnements.length === 0) {
      return res.status(200).json({ ok: true, envoyes: 0, message: "Personne n'a activé les notifications pour cet espace." });
    }

    const contenuNotification = JSON.stringify({
      title: "🔔 Nouvelle commande !",
      body: `${client || "Un client"} — ${produit || "commande"}${montant ? ` (${Number(montant).toLocaleString("fr-FR")})` : ""}`,
      url: "/",
    });

    let envoyes = 0;
    const abonnementsMorts = [];
    const erreursDetail = [];

    await Promise.all(
      abonnements.map(async (abo) => {
        const sub = {
          endpoint: abo.endpoint,
          keys: { p256dh: abo.p256dh, auth: abo.auth },
        };
        try {
          await webpush.sendNotification(sub, contenuNotification);
          envoyes += 1;
        } catch (e) {
          // On garde le détail précis de l'erreur pour pouvoir la diagnostiquer.
          erreursDetail.push({ statusCode: e.statusCode || null, message: e.message || String(e), body: e.body || null });
          // Code 404/410 = l'abonnement n'est plus valide (désinstallation, etc.) — on le nettoie.
          if (e.statusCode === 404 || e.statusCode === 410) {
            abonnementsMorts.push(abo.endpoint);
          }
        }
      })
    );

    if (abonnementsMorts.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", abonnementsMorts);
    }

    return res.status(200).json({ ok: true, envoyes, total: abonnements.length, erreurs: erreursDetail });
  }

  return res.status(400).json({ error: "Type de notification inconnu" });
}
