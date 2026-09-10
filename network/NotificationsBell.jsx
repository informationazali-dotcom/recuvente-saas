import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Cloche de notifications in-app (§25 de la mission) — réutilisée côté propriétaire
// (NetworkDashboard) et côté filleul (FilleulPortalSaas). Les notifications elles-mêmes
// sont créées uniquement par des triggers SQL (voir migrations-notifications.sql),
// jamais insérées directement par le client.
export default function NotificationsBell({ workspace }) {
  const [notifications, setNotifications] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) { setChargement(false); return; }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data || []);
    setChargement(false);
  }

  useEffect(() => {
    charger();
    // Rafraîchissement léger toutes les 60s plutôt qu'un abonnement temps réel —
    // suffisant pour ce cas d'usage, sans garder une connexion websocket ouverte en plus.
    const intervalle = setInterval(charger, 60000);
    return () => clearInterval(intervalle);
  }, [workspace.id]);

  const nonLues = notifications.filter((n) => !n.lu).length;

  async function marquerLue(id) {
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
  }

  async function toutMarquerLu() {
    const idsNonLus = notifications.filter((n) => !n.lu).map((n) => n.id);
    if (idsNonLus.length === 0) return;
    await supabase.from("notifications").update({ lu: true }).in("id", idsNonLus);
    setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
  }

  const typeIcone = { filleul: "👤", vente: "🛍️", commission: "💰", stock: "📦", prospect: "🎯", info: "🔔" };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 6 }}
        aria-label="Notifications"
      >
        🔔
        {nonLues > 0 && (
          <span style={{ position: "absolute", top: 0, right: 0, background: "#D64933", color: "white", fontSize: 9.5, fontWeight: 800, borderRadius: 999, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOuvert(false)} />
          <div style={{ position: "absolute", right: 0, top: "110%", width: 320, maxHeight: 400, overflowY: "auto", background: "white", border: "1px solid #ECE8DC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #ECE8DC" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#16231F" }}>Notifications</div>
              {nonLues > 0 && (
                <button onClick={toutMarquerLu} style={{ background: "none", border: "none", color: "#1a7a3c", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Tout marquer lu
                </button>
              )}
            </div>
            {chargement && <div style={{ padding: 14, fontSize: 12, color: "#8A9089" }}>Chargement...</div>}
            {!chargement && notifications.length === 0 && <div style={{ padding: 14, fontSize: 12, color: "#8A9089" }}>Rien pour l'instant.</div>}
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.lu && marquerLue(n.id)}
                style={{ padding: "10px 14px", borderBottom: "1px solid #F3F1EA", background: n.lu ? "white" : "#F7FAF7", cursor: n.lu ? "default" : "pointer" }}
              >
                <div style={{ fontSize: 12, fontWeight: n.lu ? 500 : 700, color: "#16231F" }}>{typeIcone[n.type] || "🔔"} {n.titre}</div>
                {n.message && <div style={{ fontSize: 11, color: "#6B7168", marginTop: 2 }}>{n.message}</div>}
                <div style={{ fontSize: 9.5, color: "#8A9089", marginTop: 3 }}>{new Date(n.created_at).toLocaleString("fr-FR")}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
