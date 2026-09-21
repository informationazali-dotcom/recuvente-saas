// ============================================================================
//  Service worker RecuVente — notifications push (nouvelle commande).
//  Une notification de vente doit se voir ET s'entendre : vibration longue, reste affichée
//  tant qu'on ne la touche pas, se re-déclenche à chaque nouvelle vente, et fait jouer le
//  « ka-ching » de l'application si l'appli est ouverte (même en arrière-plan).
//  (Quand l'app est totalement fermée, c'est le téléphone qui joue son propre son de
//   notification : le web ne permet pas d'imposer un son personnalisé dans ce cas.)
// ============================================================================
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "RecuVente", body: "Nouvelle commande reçue" };
  }
  const title = data.title || "RecuVente SaaS";
  const tag = data.tag || "commande";

  event.waitUntil(
    (async () => {
      // Même commande déjà affichée (envoi en double) : on met à jour sans re-sonner.
      let dejaAffichee = false;
      try {
        const existantes = await self.registration.getNotifications({ tag });
        dejaAffichee = existantes.length > 0 && !!data.commandeId;
      } catch (_) {}

      const options = {
        body: data.body || "Nouvelle commande reçue",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: dejaAffichee ? [] : [500, 150, 500, 150, 500, 150, 900],
        requireInteraction: true,
        renotify: !dejaAffichee,
        tag,
        timestamp: data.ts || Date.now(),
        silent: false,
        actions: [{ action: "open", title: "Voir la commande" }],
        data: { url: data.url || "/admin/", commandeId: data.commandeId || null },
      };
      await self.registration.showNotification(title, options);

      // Si l'application est ouverte (au premier plan ou en arrière-plan), on lui demande de
      // jouer le son de vente et de recharger les commandes tout de suite.
      try {
        const fenetres = await clients.matchAll({ type: "window", includeUncontrolled: true });
        fenetres.forEach((f) => f.postMessage({ type: "rv-nouvelle-commande", commandeId: data.commandeId || null, body: data.body || "", sound: !dejaAffichee && data.sound !== false }));
      } catch (_) {}
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
