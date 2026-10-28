// ============================================================================
//  Service worker RecuVente — alertes « nouvelle commande » (façon Shopify).
//
//  Chaîne complète :  commande créée → serveur (api/notifications) → Web Push →
//  CE service worker → notification système (son + vibration du téléphone).
//
//  Il fonctionne SANS l'interface React : app ouverte, en arrière-plan, écran verrouillé ou
//  navigateur fermé (dans la limite de ce que permet le téléphone).
//  - App ouverte : la notification s'affiche ET on prévient l'app (message
//    « rv-nouvelle-commande ») qui joue le vrai /sons/vente.mp3, affiche le bandeau et
//    recharge la liste.
//  - App fermée / écran verrouillé : c'est le téléphone qui joue SON son de notification
//    (un site web ne peut pas imposer un MP3 dans ce cas).
// ============================================================================

const ICONE = "/icon-192.png";
const BADGE = "/icon-192.png";
const VIBRATION = [300, 100, 300, 100, 600];

// Service worker mis à jour : il prend la main tout de suite (pas besoin de fermer tous les onglets).
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

// Application installable (téléphone / ordinateur) : les pages passent toujours par le réseau ;
// sans connexion, on affiche un écran clair au lieu de la page d'erreur du navigateur.
const HORS_LIGNE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors connexion</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#3D0C52;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}
h1{font-family:Georgia,serif;font-size:26px;margin:0 0 10px}p{opacity:.85;max-width:32ch;margin:0 auto 22px;line-height:1.5}
button{font:inherit;font-weight:600;background:#B8913F;color:#21130C;border:0;border-radius:999px;padding:13px 24px}</style></head>
<body><div><h1>Pas de connexion internet</h1><p>Vérifiez vos données mobiles ou votre Wi-Fi, puis réessayez.</p><button onclick="location.reload()">Réessayer</button></div></body></html>`;
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(fetch(req).catch(() => new Response(HORS_LIGNE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

function lireDonnees(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch (_) {
    try { return { title: "RecuVente", body: event.data ? event.data.text() : "Nouvelle commande reçue" }; } catch (__) { return { title: "RecuVente", body: "Nouvelle commande reçue" }; }
  }
}

self.addEventListener("push", (event) => {
  const data = lireDonnees(event);
  // Compatibilité : anciens envois (commandeId) et nouveaux (orderId).
  const orderId = data.orderId || data.commandeId || null;
  const estCommande = data.type === "new_order" || (!!orderId && String(data.tag || "").indexOf("paiement-") !== 0);
  const title = data.title || (estCommande ? "🔔 Nouvelle commande" : "RecuVente");
  const tag = data.tag || (orderId ? `rv-order-${orderId}` : `rv-${Date.now()}`);
  const url = data.url || (orderId ? `/admin/?commande=${encodeURIComponent(orderId)}` : "/admin/");

  event.waitUntil(
    (async () => {
      // La même commande déjà affichée (envoi en double) : on la met à jour sans re-sonner.
      let dejaAffichee = false;
      try {
        const existantes = await self.registration.getNotifications({ tag });
        dejaAffichee = existantes.length > 0 && !!orderId;
      } catch (_) {}

      const options = {
        body: data.body || "Nouvelle commande reçue",
        icon: ICONE,
        badge: BADGE,
        tag,
        renotify: !dejaAffichee,        // chaque NOUVELLE commande re-sonne / re-vibre
        requireInteraction: true,       // reste affichée jusqu'au toucher (ordinateur ; Android décide seul)
        silent: false,
        timestamp: data.ts || Date.now(),
        data: { url, orderId, workspaceId: data.workspaceId || null, type: data.type || (estCommande ? "new_order" : "info") },
      };
      // Options non supportées partout (iPhone ignore vibrate/actions) : ajoutées sans risque.
      if (!dejaAffichee) options.vibrate = VIBRATION;
      if (orderId) {
        options.actions = [
          { action: "voir", title: "Voir la commande" },
          { action: "fermer", title: "Fermer" },
        ];
      }

      try {
        await self.registration.showNotification(title, options);
      } catch (_) {
        // Un navigateur qui refuse une option (actions, vibrate…) : on réessaie en version simple,
        // une notification doit TOUJOURS s'afficher.
        try { await self.registration.showNotification(title, { body: options.body, icon: ICONE, badge: BADGE, tag, data: options.data }); } catch (__) {}
      }

      // App ouverte (premier plan ou arrière-plan) : elle joue le « ka-ching », affiche le bandeau
      // et recharge les commandes tout de suite.
      try {
        const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        fenetres.forEach((f) => f.postMessage({
          type: "rv-nouvelle-commande",
          commandeId: orderId,
          orderId,
          workspaceId: data.workspaceId || null,
          body: data.body || "",
          sound: !dejaAffichee && data.sound !== false && estCommande,
        }));
      } catch (_) {}
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const donnees = (event.notification && event.notification.data) || {};
  event.notification.close();
  if (event.action === "fermer") return;

  const orderId = donnees.orderId || null;
  const cible = new URL(donnees.url || (orderId ? `/admin/?commande=${encodeURIComponent(orderId)}` : "/admin/"), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 1) Une fenêtre RecuVente existe déjà : on la met au premier plan et on lui demande
      //    d'ouvrir la commande (sans recharger la page).
      const existante = fenetres.find((c) => c.url.indexOf(self.location.origin) === 0) || null;
      if (existante) {
        try { await existante.focus(); } catch (_) {}
        try { existante.postMessage({ type: "rv-ouvrir-commande", commandeId: orderId, orderId }); } catch (_) {}
        // Filet : si la fenêtre n'est pas sur le tableau de bord, on l'y emmène avec la commande.
        if (orderId && existante.url.indexOf("/admin") === -1 && "navigate" in existante) {
          try { await existante.navigate(cible); } catch (_) {}
        }
        return;
      }
      // 2) Aucune fenêtre : on ouvre RecuVente directement sur la commande.
      if (self.clients.openWindow) await self.clients.openWindow(cible);
    })()
  );
});

// Le navigateur a changé l'abonnement tout seul (expiration, rotation) : on se réabonne et on
// prévient le serveur, qui garde la même boutique et le même utilisateur pour cet appareil.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const ancien = event.oldSubscription || null;
        const cle = ancien && ancien.options ? ancien.options.applicationServerKey : null;
        const nouveau = event.newSubscription || (cle ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle }) : null);
        if (!ancien || !nouveau) return;
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "renouveler_abonnement", ancienEndpoint: ancien.endpoint, subscription: nouveau.toJSON() }),
        });
      } catch (_) {}
    })()
  );
});
