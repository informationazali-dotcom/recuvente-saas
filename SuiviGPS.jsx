// ============================================================================
//  SUIVI GPS DES LIVREURS — module additif (aucune fonction existante supprimée).
//
//  • useTraceurGPS : le « traceur » du téléphone du livreur, optimisé :
//      - filtre les positions imprécises, n'envoie que quand il bouge vraiment
//        (ou un signe de vie toutes les 45 s) → moins de batterie et de data ;
//      - envoie par paquets, GARDE les points hors ligne et les renvoie au retour du réseau ;
//      - garde l'écran allumé pendant la tournée (Wake Lock) et relance le GPS tout seul
//        s'il se fige ou quand le livreur revient sur l'app ;
//      - retombe sur l'ancien système (colonnes livreurs.position_*) si la migration SQL
//        n'est pas encore appliquée : rien ne casse.
//  • CarteSuiviLivreurs : la carte en direct du patron (positions animées, direction,
//    vitesse, batterie, « en route vers », signal perdu, trajet et points de livraison).
//  • CarteLivreurClient : sur la page de suivi du client, « votre livreur arrive ».
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase as supabaseApp } from "./supabaseClient";

// ---------------------------------------------------------------- outils
export function distanceMetres(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function ecartAngle(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function depuisTexte(iso) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return `il y a ${h} h ${String(m % 60).padStart(2, "0")}`;
}
function echapper(t) { return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fonctionAbsente(error) {
  const m = `${error?.code || ""} ${error?.message || ""}`;
  return /PGRST202|42883|Could not find the function|does not exist/i.test(m);
}

let promesseLeaflet = null;
export function chargerLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("pas de fenêtre"));
  if (window.L) return Promise.resolve(window.L);
  if (promesseLeaflet) return promesseLeaflet;
  promesseLeaflet = new Promise((ok, ko) => {
    if (!document.querySelector('link[data-rv-leaflet]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; l.setAttribute("data-rv-leaflet", "1");
      document.head.appendChild(l);
    }
    const existant = document.querySelector('script[src*="leaflet@1.9.4/dist/leaflet.js"]');
    const s = existant || document.createElement("script");
    const fini = () => (window.L ? ok(window.L) : ko(new Error("Leaflet indisponible")));
    s.addEventListener("load", fini); s.addEventListener("error", () => { promesseLeaflet = null; ko(new Error("Leaflet indisponible")); });
    if (!existant) { s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.async = true; document.head.appendChild(s); }
    else if (window.L) fini();
  });
  return promesseLeaflet;
}

// ============================================================================
//  1) TRACEUR (téléphone du livreur)
// ============================================================================
const CLE_FILE = (id) => `rv_gps_file_${id}`;
function lireFile(id) { try { const v = JSON.parse(localStorage.getItem(CLE_FILE(id)) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function ecrireFile(id, file) { try { localStorage.setItem(CLE_FILE(id), JSON.stringify(file.slice(-500))); } catch (_) {} }

export function useTraceurGPS({ livreur, actif, commandeEnCours = null, supabase = supabaseApp }) {
  const livreurId = livreur?.id;
  const [etat, setEtat] = useState({ precision: null, vitesse: null, derniereFix: null, dernierEnvoi: null, enAttente: livreurId ? lireFile(livreurId).length : 0, erreur: null, ecranAllume: false, batterie: null, modeSimple: false, arretDepuis: null });
  const refs = useRef({ watchId: null, dernierGarde: null, derniereFix: 0, wakeLock: null, envoiEnCours: false, modeSimple: false, batterie: null, commande: commandeEnCours, dernierePosition: null, immobileDepuis: null });
  refs.current.commande = commandeEnCours;

  const maj = (p) => setEtat((e) => ({ ...e, ...p }));

  async function envoyer() {
    const r = refs.current;
    if (!livreurId || r.envoiEnCours || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const file = lireFile(livreurId);
    if (file.length === 0) return;
    r.envoiEnCours = true;
    try {
      const paquet = file.slice(0, 200);
      if (!r.modeSimple) {
        const { error } = await supabase.rpc("enregistrer_positions_livreur", { p_livreur: livreurId, p_points: paquet, p_batterie: r.batterie });
        if (error && fonctionAbsente(error)) { r.modeSimple = true; maj({ modeSimple: true }); }
        else if (error) throw error;
        else { ecrireFile(livreurId, lireFile(livreurId).slice(paquet.length)); maj({ dernierEnvoi: new Date().toISOString(), enAttente: lireFile(livreurId).length, erreur: null }); }
      }
      if (r.modeSimple) {
        // Ancien système (migration pas encore appliquée) : on écrit juste la dernière position.
        const dernier = file[file.length - 1];
        const { error } = await supabase.from("livreurs").update({ position_lat: dernier.lat, position_lng: dernier.lng, position_maj: new Date().toISOString() }).eq("id", livreurId);
        if (error) throw error;
        ecrireFile(livreurId, []);
        maj({ dernierEnvoi: new Date().toISOString(), enAttente: 0, erreur: null });
      }
    } catch (_) {
      maj({ enAttente: lireFile(livreurId).length });
    } finally {
      r.envoiEnCours = false;
    }
  }

  function garder(p, ev = "position") {
    const file = lireFile(livreurId);
    file.push({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), acc: p.acc != null ? Math.round(p.acc) : null, spd: p.spd != null ? +p.spd.toFixed(1) : null, hdg: p.hdg != null ? Math.round(p.hdg) : null, t: new Date(p.t).toISOString(), ev, cmd: refs.current.commande || null });
    ecrireFile(livreurId, file);
    refs.current.dernierGarde = p;
    maj({ enAttente: file.length });
  }

  function surPosition(pos) {
    const r = refs.current;
    const c = pos.coords;
    const p = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, spd: Number.isFinite(c.speed) ? c.speed : null, hdg: Number.isFinite(c.heading) ? c.heading : null, t: pos.timestamp || Date.now() };
    r.derniereFix = Date.now();
    r.dernierePosition = p;
    // Immobile depuis combien de temps ? (sert à proposer « Je suis arrivé »)
    const prec = r.dernierGarde;
    const bouge = !prec || distanceMetres(prec, p) > Math.max(25, (p.acc || 0) * 0.8) || (p.spd != null && p.spd > 1.2);
    if (bouge) r.immobileDepuis = null; else if (!r.immobileDepuis) r.immobileDepuis = Date.now();
    maj({ precision: p.acc, vitesse: p.spd, derniereFix: new Date().toISOString(), erreur: null, arretDepuis: r.immobileDepuis });

    // Position trop imprécise (réseau seulement) : on l'ignore, sauf si c'est tout ce qu'on a depuis 1 min.
    if (p.acc > 150 && prec && Date.now() - prec.t < 60000) return;
    if (!prec) { garder(p); envoyer(); return; }
    const d = distanceMetres(prec, p);
    const seuil = Math.max(12, Math.min(60, (p.acc || 20) / 2));
    const virage = p.hdg != null && prec.hdg != null && (p.spd || 0) > 2 && ecartAngle(p.hdg, prec.hdg) > 35;
    if (d >= seuil || virage || p.t - prec.t >= 45000) garder(p);
  }

  function surErreur(err) {
    maj({ erreur: err && err.code === 1 ? "Autorisation de localisation refusée. Active-la dans les réglages du téléphone (Localisation → Autoriser)." : "Signal GPS faible… on réessaie." });
  }

  function lancerSuivi() {
    const r = refs.current;
    if (!navigator.geolocation) { maj({ erreur: "La géolocalisation n'est pas disponible sur cet appareil." }); return; }
    if (r.watchId !== null) { try { navigator.geolocation.clearWatch(r.watchId); } catch (_) {} }
    r.watchId = navigator.geolocation.watchPosition(surPosition, surErreur, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }

  async function allumerEcran() {
    const r = refs.current;
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !r.wakeLock) {
        r.wakeLock = await navigator.wakeLock.request("screen");
        maj({ ecranAllume: true });
        r.wakeLock.addEventListener("release", () => { r.wakeLock = null; maj({ ecranAllume: false }); });
      }
    } catch (_) {}
  }

  useEffect(() => {
    if (!actif || !livreurId) return undefined;
    const r = refs.current;
    lancerSuivi();
    allumerEcran();
    try {
      if (navigator.getBattery) navigator.getBattery().then((b) => {
        const lire = () => { r.batterie = Math.round(b.level * 100); maj({ batterie: r.batterie }); };
        lire(); b.addEventListener("levelchange", lire);
      }).catch(() => {});
    } catch (_) {}
    const envoi = setInterval(envoyer, 8000);
    // Chien de garde : GPS figé depuis 60 s → on le relance.
    const garde = setInterval(() => { if (Date.now() - r.derniereFix > 60000) lancerSuivi(); }, 20000);
    const retour = () => { if (document.visibilityState === "visible") { lancerSuivi(); allumerEcran(); envoyer(); } else envoyer(); };
    const enLigne = () => envoyer();
    document.addEventListener("visibilitychange", retour);
    window.addEventListener("online", enLigne);
    window.addEventListener("pagehide", envoyer);
    return () => {
      clearInterval(envoi); clearInterval(garde);
      document.removeEventListener("visibilitychange", retour);
      window.removeEventListener("online", enLigne);
      window.removeEventListener("pagehide", envoyer);
      if (r.watchId !== null) { try { navigator.geolocation.clearWatch(r.watchId); } catch (_) {} r.watchId = null; }
      if (r.wakeLock) { try { r.wakeLock.release(); } catch (_) {} r.wakeLock = null; }
      envoyer();
    };
  }, [actif, livreurId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Événement de livraison (départ, arrivée, livrée, échec…) avec la position du moment.
  async function evenement(type, commandeId) {
    const p = refs.current.dernierePosition;
    if (type === "depart") refs.current.commande = commandeId;
    if (type === "livree" || type === "echec" || type === "annule" || type === "fin_tournee") refs.current.commande = null;
    if (p) { garder(p, type); envoyer(); }
    try {
      const { error } = await supabase.rpc("livreur_evenement", { p_livreur: livreurId, p_commande: commandeId || null, p_evenement: type, p_lat: p ? p.lat : null, p_lng: p ? p.lng : null, p_precision: p ? p.acc : null });
      return !error;
    } catch (_) { return false; }
  }

  return { ...etat, evenement, envoyerMaintenant: envoyer, relancer: lancerSuivi };
}

// Bandeau d'état du GPS dans l'app livreur.
export function BandeauGPS({ traceur }) {
  const [, forcer] = useState(0);
  useEffect(() => { const i = setInterval(() => forcer((n) => n + 1), 5000); return () => clearInterval(i); }, []);
  const ageFix = traceur.derniereFix ? (Date.now() - new Date(traceur.derniereFix).getTime()) / 1000 : null;
  const bon = ageFix != null && ageFix < 40 && (traceur.precision == null || traceur.precision <= 60);
  const moyen = ageFix != null && ageFix < 90;
  const couleur = bon ? "#34d399" : moyen ? "#fbbf24" : "#f87171";
  return (
    <div style={{ marginTop: 8, background: "rgba(0,0,0,0.18)", border: `1px solid ${couleur}55`, borderRadius: 10, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: couleur, boxShadow: `0 0 8px ${couleur}` }} />
        {bon ? "GPS excellent" : moyen ? "GPS moyen" : "Recherche du signal GPS…"}
        {traceur.precision != null && <span style={{ opacity: 0.8, fontWeight: 500 }}>· ±{Math.round(traceur.precision)} m</span>}
        {traceur.vitesse != null && traceur.vitesse > 0.5 && <span style={{ opacity: 0.8, fontWeight: 500 }}>· {Math.round(traceur.vitesse * 3.6)} km/h</span>}
      </div>
      <div style={{ opacity: 0.85 }}>
        {traceur.dernierEnvoi ? `Envoyé ${depuisTexte(traceur.dernierEnvoi)}` : "Premier envoi en cours…"}
        {traceur.enAttente > 1 && ` · ${traceur.enAttente} points gardés (envoi dès que le réseau revient)`}
        {traceur.batterie != null && ` · 🔋 ${traceur.batterie}%`}
      </div>
      <div style={{ opacity: 0.75 }}>{traceur.ecranAllume ? "☀️ Écran maintenu allumé pendant la tournée" : "⚠️ Garde l'application ouverte : écran verrouillé = position en pause."}</div>
      {traceur.erreur && <div style={{ color: "#fecaca", fontWeight: 700, marginTop: 2 }}>{traceur.erreur}</div>}
    </div>
  );
}

// ============================================================================
//  2) CARTE EN DIRECT DU PATRON
// ============================================================================
function statutLivreur(l) {
  const age = l.position_maj ? (Date.now() - new Date(l.position_maj).getTime()) / 1000 : Infinity;
  if (!l.en_tournee) return { cle: "hors", nom: "Hors tournée", couleur: "#94a3b8" };
  if (!l.position_lat) return { cle: "attente", nom: "Position en attente…", couleur: "#94a3b8" };
  if (age > 180) return { cle: "perdu", nom: `Signal perdu ${depuisTexte(l.position_maj)}`, couleur: "#9ca3af" };
  if ((l.position_vitesse || 0) > 1.2) return { cle: "roule", nom: `En mouvement · ${Math.round((l.position_vitesse || 0) * 3.6)} km/h`, couleur: "#16a34a" };
  return { cle: "arret", nom: "À l'arrêt", couleur: "#f59e0b" };
}

export function CarteSuiviLivreurs({ livreurs = [], supabase = supabaseApp, hauteur = 340 }) {
  const workspaceId = livreurs[0]?.workspace_id || null;
  const [liste, setListe] = useState(livreurs);
  const [commandesEnRoute, setCommandesEnRoute] = useState({});
  const [selection, setSelection] = useState(null);
  const [trajets, setTrajets] = useState({});
  const [pleinEcran, setPleinEcran] = useState(false);
  const [pret, setPret] = useState(typeof window !== "undefined" && !!window.L);
  const [, forcer] = useState(0);
  const boite = useRef(null);
  const carte = useRef(null);
  const couches = useRef({ marqueurs: {}, traces: null, points: null, cadre: false });

  useEffect(() => { if (livreurs.length) setListe((ancienne) => (ancienne.length ? ancienne : livreurs)); }, [livreurs]);

  // Rafraîchissement en direct (toutes les 7 s, seulement quand l'écran est visible).
  useEffect(() => {
    if (!workspaceId) return undefined;
    let vivant = true;
    const lire = async () => {
      if (document.visibilityState === "hidden") return;
      const { data } = await supabase.from("livreurs").select("*").eq("workspace_id", workspaceId);
      if (!vivant || !Array.isArray(data)) return;
      setListe(data);
      const ids = data.map((l) => l.commande_en_cours).filter(Boolean);
      if (ids.length) {
        const { data: cmds } = await supabase.from("commandes").select("id, client, zone, tel, montant, livreur_parti_le, livreur_arrive_le").in("id", ids);
        if (vivant && Array.isArray(cmds)) setCommandesEnRoute(Object.fromEntries(cmds.map((c) => [c.id, c])));
      } else setCommandesEnRoute({});
    };
    lire();
    const i = setInterval(lire, 7000);
    const t = setInterval(() => forcer((n) => n + 1), 15000);
    return () => { vivant = false; clearInterval(i); clearInterval(t); };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trajet (3 dernières heures) des livreurs en tournée — rechargé toutes les 30 s.
  const enTournee = liste.filter((l) => l.en_tournee);
  const clesTournee = enTournee.map((l) => l.id).join(",");
  useEffect(() => {
    if (!clesTournee) return undefined;
    let vivant = true;
    const lire = async () => {
      if (document.visibilityState === "hidden") return;
      const res = {};
      for (const l of enTournee) {
        const { data, error } = await supabase.rpc("trajet_livreur", { p_livreur: l.id });
        if (error) return; // migration pas encore appliquée : pas de trajet, rien ne casse
        res[l.id] = data || [];
      }
      if (vivant) setTrajets(res);
    };
    lire();
    const i = setInterval(lire, 30000);
    return () => { vivant = false; clearInterval(i); };
  }, [clesTournee]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { chargerLeaflet().then(() => setPret(true)).catch(() => {}); }, []);

  // Carte + marqueurs animés.
  useEffect(() => {
    const L = typeof window !== "undefined" ? window.L : null;
    if (!pret || !L || !boite.current) return;
    if (!carte.current) {
      carte.current = L.map(boite.current, { zoomControl: true, attributionControl: true }).setView([14.6928, -17.4467], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(carte.current);
    }
    const c = couches.current;
    const avecPosition = liste.filter((l) => l.en_tournee && l.position_lat && l.position_lng);
    const vus = new Set();
    avecPosition.forEach((l) => {
      vus.add(l.id);
      const st = statutLivreur(l);
      const cap = Number.isFinite(l.position_cap) && (l.position_vitesse || 0) > 1.2 ? l.position_cap : null;
      const cmd = l.commande_en_cours ? commandesEnRoute[l.commande_en_cours] : null;
      const html = `<div style="position:relative;transform:translate(-50%,-50%)">
        ${st.cle === "roule" ? `<div style="position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:${st.couleur}33;animation:rvGpsPulse 1.8s ease-out infinite"></div>` : ""}
        ${cap != null ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;margin-left:-7px;margin-top:-30px;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid ${st.couleur};transform-origin:7px 30px;transform:rotate(${cap}deg)"></div>` : ""}
        <div style="position:relative;width:34px;height:34px;border-radius:50%;background:${st.couleur};border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 16px system-ui">🛵</div>
        <div style="position:absolute;left:50%;top:38px;transform:translateX(-50%);white-space:nowrap;background:#16231F;color:white;font:700 11px system-ui;padding:3px 7px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${echapper(String(l.nom || "").split(" ")[0])}${cmd ? ` → ${echapper(String(cmd.client || "").split(" ")[0])}` : ""}</div>
      </div>`;
      const icone = L.divIcon({ html, className: "", iconSize: [0, 0] });
      const popup = `<div style="font:13px system-ui;min-width:190px">
        <b style="font-size:14px">${echapper(l.nom)}</b><br/>
        <span style="color:${st.couleur};font-weight:700">● ${echapper(st.nom)}</span><br/>
        ${cmd ? `➡️ En route vers <b>${echapper(cmd.client)}</b>${cmd.zone ? `<br/>📍 ${echapper(cmd.zone)}` : ""}${cmd.livreur_arrive_le ? `<br/>✅ Arrivé ${echapper(depuisTexte(cmd.livreur_arrive_le))}` : cmd.livreur_parti_le ? `<br/>⏱️ Parti ${echapper(depuisTexte(cmd.livreur_parti_le))}` : ""}<br/>` : ""}
        🕒 Position ${echapper(depuisTexte(l.position_maj))}${l.position_precision ? ` · ±${Math.round(l.position_precision)} m` : ""}<br/>
        ${l.batterie != null ? `🔋 ${l.batterie}%<br/>` : ""}
        ${l.telephone ? `<a href="tel:${echapper(l.telephone)}">📞 Appeler ${echapper(String(l.nom || "").split(" ")[0])}</a> · ` : ""}<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${l.position_lat},${l.position_lng}">Google Maps</a>
      </div>`;
      const cible = [l.position_lat, l.position_lng];
      const existant = c.marqueurs[l.id];
      if (existant) {
        existant.setIcon(icone);
        existant.getPopup() ? existant.setPopupContent(popup) : existant.bindPopup(popup);
        // Glissement doux vers la nouvelle position (1 s).
        const depart = existant.getLatLng(); const t0 = performance.now();
        const anim = (t) => { const k = Math.min(1, (t - t0) / 1000); existant.setLatLng([depart.lat + (cible[0] - depart.lat) * k, depart.lng + (cible[1] - depart.lng) * k]); if (k < 1) requestAnimationFrame(anim); };
        if (distanceMetres({ lat: depart.lat, lng: depart.lng }, { lat: cible[0], lng: cible[1] }) > 1) requestAnimationFrame(anim);
      } else {
        c.marqueurs[l.id] = L.marker(cible, { icon: icone, zIndexOffset: 500 }).addTo(carte.current).bindPopup(popup);
        c.marqueurs[l.id].on("click", () => setSelection(l.id));
      }
    });
    Object.keys(c.marqueurs).forEach((id) => { if (!vus.has(id)) { c.marqueurs[id].remove(); delete c.marqueurs[id]; } });

    // Trajets : trait lumineux + points de livraison ✓.
    if (c.traces) c.traces.remove();
    if (c.points) c.points.remove();
    c.traces = L.layerGroup().addTo(carte.current);
    c.points = L.layerGroup().addTo(carte.current);
    Object.entries(trajets).forEach(([id, pts]) => {
      if (!pts || pts.length < 2) return;
      const actif = !selection || selection === id;
      const ligne = pts.map((p) => [p.lat, p.lng]);
      L.polyline(ligne, { color: "#ffffff", weight: actif ? 7 : 4, opacity: actif ? 0.9 : 0.4 }).addTo(c.traces);
      L.polyline(ligne, { color: actif ? "#16a34a" : "#64748b", weight: actif ? 4 : 2, opacity: actif ? 0.95 : 0.5, dashArray: actif ? null : "4 6" }).addTo(c.traces);
      pts.filter((p) => p.evenement === "livree" || p.evenement === "echec" || p.evenement === "arrivee").forEach((p) => {
        const ic = p.evenement === "livree" ? "✅" : p.evenement === "echec" ? "❌" : "📍";
        L.marker([p.lat, p.lng], { icon: L.divIcon({ html: `<div style="transform:translate(-50%,-50%);font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${ic}</div>`, className: "", iconSize: [0, 0] }) })
          .bindPopup(`<div style="font:12.5px system-ui">${ic} ${p.evenement === "livree" ? "Livré ici" : p.evenement === "echec" ? "Échec ici" : "Arrivé ici"}<br/>${new Date(p.enregistre_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>`)
          .addTo(c.points);
      });
    });

    if (!c.cadre && avecPosition.length > 0) {
      c.cadre = true;
      carte.current.fitBounds(L.latLngBounds(avecPosition.map((l) => [l.position_lat, l.position_lng])), { padding: [50, 50], maxZoom: 15 });
    }
    setTimeout(() => carte.current && carte.current.invalidateSize(), 120);
  }, [pret, liste, trajets, selection, commandesEnRoute]);

  useEffect(() => { setTimeout(() => carte.current && carte.current.invalidateSize(), 150); }, [pleinEcran]);
  useEffect(() => () => { if (carte.current) { carte.current.remove(); carte.current = null; } }, []);

  const centrerSur = (l) => {
    setSelection(l.id);
    if (carte.current && l.position_lat) { carte.current.setView([l.position_lat, l.position_lng], 16, { animate: true }); const m = couches.current.marqueurs[l.id]; if (m) m.openPopup(); }
  };
  const toutVoir = () => {
    setSelection(null);
    const L = window.L; const pts = liste.filter((l) => l.en_tournee && l.position_lat).map((l) => [l.position_lat, l.position_lng]);
    if (L && carte.current && pts.length) carte.current.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
  };

  const tries = useMemo(() => [...liste].sort((a, b) => Number(!!b.en_tournee) - Number(!!a.en_tournee) || String(a.nom).localeCompare(String(b.nom))), [liste]);
  const nbActifs = enTournee.filter((l) => l.position_maj && Date.now() - new Date(l.position_maj).getTime() < 180000).length;

  return (
    <div style={pleinEcran ? { position: "fixed", inset: 0, zIndex: 200, background: "white", padding: 12, display: "flex", flexDirection: "column" } : { marginBottom: 16 }}>
      <style>{`@keyframes rvGpsPulse{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.6);opacity:0}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 }}>🛰️ Suivi GPS des livreurs en direct</div>
        {nbActifs > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", background: "#EAF7F1", borderRadius: 999, padding: "2px 8px" }}>● {nbActifs} en ligne</span>}
        <div style={{ flex: 1 }} />
        <button onClick={toutVoir} style={{ border: "1px solid #DDD8CC", background: "white", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🎯 Tout voir</button>
        <button onClick={() => setPleinEcran((v) => !v)} style={{ border: "1px solid #DDD8CC", background: "white", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{pleinEcran ? "✕ Fermer" : "⛶ Plein écran"}</button>
      </div>
      <div ref={boite} style={{ width: "100%", height: pleinEcran ? "auto" : hauteur, flex: pleinEcran ? 1 : "none", minHeight: 220, borderRadius: 12, overflow: "hidden", border: "1px solid #ECE8DC", background: "#EEF0EA" }} />
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 8, paddingBottom: 2 }}>
        {tries.filter((l) => l.en_tournee).map((l) => {
          const st = statutLivreur(l);
          const cmd = l.commande_en_cours ? commandesEnRoute[l.commande_en_cours] : null;
          return (
            <button key={l.id} onClick={() => centrerSur(l)} style={{ flexShrink: 0, textAlign: "left", minWidth: 190, maxWidth: 240, border: `1.5px solid ${selection === l.id ? st.couleur : "#ECE8DC"}`, background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#16231F" }}>🛵 {l.nom}</div>
              <div style={{ fontSize: 11.5, color: st.couleur, fontWeight: 700, marginTop: 1 }}>● {st.nom}</div>
              {cmd && <div style={{ fontSize: 11.5, color: "#16231F", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>➡️ {cmd.client}{cmd.zone ? ` · ${cmd.zone}` : ""}</div>}
              {cmd && cmd.livreur_arrive_le && <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>📍 Arrivé chez le client</div>}
              <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>{depuisTexte(l.position_maj)}{l.batterie != null ? ` · 🔋 ${l.batterie}%` : ""}</div>
            </button>
          );
        })}
        {enTournee.length === 0 && <div style={{ fontSize: 12, color: "#8A9089" }}>Aucun livreur en tournée pour le moment. Dès qu'un livreur appuie sur « Démarrer ma tournée », il apparaît ici en direct.</div>}
      </div>
      {enTournee.some((l) => statutLivreur(l).cle === "perdu") && (
        <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 6 }}>ℹ️ « Signal perdu » : le téléphone du livreur est verrouillé, l'app est fermée ou il n'a plus de réseau. Les points gardés hors ligne arrivent dès qu'il retrouve le réseau.</div>
      )}
    </div>
  );
}

// ============================================================================
//  3) PAGE DE SUIVI DU CLIENT — « votre livreur arrive »
// ============================================================================
export function CarteLivreurClient({ commandeId, supabase = supabaseApp, couleur = "#1a7a3c" }) {
  const [info, setInfo] = useState(null);
  const boite = useRef(null);
  const carte = useRef(null);
  const marqueur = useRef(null);
  const [, forcer] = useState(0);

  useEffect(() => {
    if (!commandeId) return undefined;
    let vivant = true;
    const lire = () => {
      if (document.visibilityState === "hidden") return;
      supabase.rpc("position_livreur_pour_commande", { p_commande: commandeId }).then(({ data, error }) => {
        if (!vivant) return;
        setInfo(!error && Array.isArray(data) && data[0] ? data[0] : null);
      }, () => {});
    };
    lire();
    const i = setInterval(lire, 10000);
    const t = setInterval(() => forcer((n) => n + 1), 10000);
    return () => { vivant = false; clearInterval(i); clearInterval(t); };
  }, [commandeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!info || !boite.current) return;
    chargerLeaflet().then((L) => {
      if (!boite.current) return;
      if (!carte.current) {
        carte.current = L.map(boite.current, { zoomControl: false, attributionControl: true }).setView([info.lat, info.lng], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(carte.current);
      }
      const icone = L.divIcon({ html: `<div style="transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:${couleur};border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px">🛵</div>`, className: "", iconSize: [0, 0] });
      if (!marqueur.current) marqueur.current = L.marker([info.lat, info.lng], { icon: icone }).addTo(carte.current);
      else marqueur.current.setLatLng([info.lat, info.lng]);
      carte.current.panTo([info.lat, info.lng], { animate: true });
      setTimeout(() => carte.current && carte.current.invalidateSize(), 100);
    }).catch(() => {});
  }, [info && info.lat, info && info.lng, !!info]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (carte.current) { carte.current.remove(); carte.current = null; marqueur.current = null; } }, []);
  useEffect(() => { if (!info && carte.current) { carte.current.remove(); carte.current = null; marqueur.current = null; } }, [!!info]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const arrive = !!info.arrive_le;
  return (
    <div style={{ background: "white", border: `1.5px solid ${couleur}55`, borderRadius: 14, overflow: "hidden", marginBottom: 16, boxShadow: `0 6px 24px ${couleur}22` }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: arrive ? "#16a34a" : couleur, boxShadow: `0 0 10px ${arrive ? "#16a34a" : couleur}` }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#16231F" }}>{arrive ? `📍 ${info.prenom} est arrivé !` : `🛵 ${info.prenom} est en route vers vous`}</div>
          <div style={{ fontSize: 12, color: "#6B7168" }}>{arrive ? "Préparez-vous, votre livreur est devant chez vous." : `Position mise à jour ${depuisTexte(info.maj)}`}</div>
        </div>
      </div>
      <div ref={boite} style={{ width: "100%", height: 210, background: "#EEF0EA" }} />
    </div>
  );
}
