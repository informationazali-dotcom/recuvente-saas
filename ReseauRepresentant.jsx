// =====================================================================
// RecuVente — Réseau national : ESPACE REPRÉSENTANT
// Missions (accepter / refuser / livrer avec code), stock, propositions,
// inventaire, performances. Pensé pour un téléphone, une main.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  fmt, fmtDate, rpc, erreurTexte, lienWhatsApp, telLien, useStylesReseau, useCompteARebours, formatDuree, envoyerPhotos,
  envoyerPreuve, compresserImage, BoutonAlertes, PadSignature, useMarque, EnteteEspace, CarteRepresentant,
  ETATS, STATUTS_MISSION, STATUTS_ARTICLE, MODES_PAIEMENT, CATEGORIES_DEFAUT, Bouton, Champ, Message, Modale, Vide, Pastille, Icone,
} from "./ReseauCommun.jsx";

export default function EspaceRepresentant({ supabase, slug }) {
  const [session, setSession] = useState(undefined);
  const [rep, setRep] = useState(undefined);
  const [erreur, setErreur] = useState("");
  useStylesReseau(rep?.boutique?.couleur_principale, rep?.boutique?.couleur_or);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) { setRep(session === null ? null : undefined); return; }
    rpc(supabase, "rn_rep_lier", { p_slug: slug }).then(setRep).catch((e) => { setErreur(erreurTexte(e)); setRep(null); });
  }, [supabase, slug, session]);

  if (session === undefined || (session && rep === undefined))
    return <div className="rn" style={{ display: "grid", placeItems: "center" }}><span className="rn-spin" style={{ color: "var(--rn-prune)", width: 28, height: 28 }} /></div>;
  if (!session) return <Connexion supabase={supabase} slug={slug} />;
  if (!rep)
    return (
      <div className="rn">
        <Vide titre="Compte non reconnu" action={<Bouton variante="contour" onClick={() => supabase.auth.signOut()}>Se déconnecter</Bouton>}>
          {erreur || `L'adresse ${session.user.email} n'est pas enregistrée comme représentant. Demandez à l'administration de vous ajouter avec cette adresse.`}
        </Vide>
      </div>
    );
  if (rep.statut !== "actif")
    return <div className="rn"><Vide titre="Compte suspendu">Contactez l'administration.</Vide></div>;
  return <Tableau supabase={supabase} rep={rep} setRep={setRep} slug={slug} />;
}

export function Connexion({ supabase, slug, titre = "Espace représentant", texte = "Connectez-vous pour voir vos missions de livraison.", texteCreation = "Utilisez l'adresse e-mail que l'administration a enregistrée pour vous." }) {
  const marque = useMarque(supabase, slug);
  useStylesReseau(marque?.couleur, marque?.or);
  const [mode, setMode] = useState("connexion");
  const [f, setF] = useState({ email: "", mdp: "" });
  const [msg, setMsg] = useState({ ton: "", texte: "" });
  const [charge, setCharge] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setCharge(true); setMsg({});
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.mdp });
        if (error) throw error;
      } else if (mode === "creation") {
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.mdp });
        if (error) throw error;
        if (!data.session) setMsg({ ton: "ok", texte: "Compte créé. Ouvrez l'e-mail de confirmation puis revenez vous connecter." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: window.location.href });
        if (error) throw error;
        setMsg({ ton: "ok", texte: "Un lien pour choisir un nouveau mot de passe vous a été envoyé par e-mail." });
      }
    } catch (e2) {
      setMsg({ ton: "danger", texte: /Invalid login/i.test(e2.message) ? "E-mail ou mot de passe incorrect." : erreurTexte(e2) });
    } finally { setCharge(false); }
  };
  return (
    <div className="rn rn-connexion">
      <form className="rn-carte rn-pile" style={{ width: "100%", maxWidth: 400, gap: 14, position: "relative" }} onSubmit={envoyer}>
        {marque ? (
          <div className="rn-connexion-marque">
            {marque.logo ? <img src={marque.logo} alt="" /> : null}
            <span>{marque.nom}</span>
          </div>
        ) : null}
        <h2>{titre}</h2>
        <p className="rn-muet">{mode === "creation" ? texteCreation : texte}</p>
        <Champ label="E-mail"><input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Champ>
        {mode !== "oubli" ? (
          <Champ label={mode === "creation" ? "Choisissez un mot de passe" : "Mot de passe"} aide={mode === "creation" ? "8 caractères minimum." : null}>
            <input type="password" autoComplete={mode === "creation" ? "new-password" : "current-password"} minLength={mode === "creation" ? 8 : undefined} value={f.mdp} onChange={(e) => setF({ ...f, mdp: e.target.value })} required />
          </Champ>
        ) : null}
        <Message ton={msg.ton}>{msg.texte}</Message>
        <Bouton type="submit" chargement={charge}>
          {mode === "connexion" ? "Se connecter" : mode === "creation" ? "Créer mon accès" : "Recevoir le lien"}
        </Bouton>
        <div className="rn-entre rn-petit">
          {mode !== "creation" ? <a href="#" onClick={(e) => { e.preventDefault(); setMode("creation"); }}>Première connexion</a> : <a href="#" onClick={(e) => { e.preventDefault(); setMode("connexion"); }}>J'ai déjà un accès</a>}
          {mode === "connexion" ? <a href="#" onClick={(e) => { e.preventDefault(); setMode("oubli"); }}>Mot de passe oublié</a> : null}
        </div>
      </form>
    </div>
  );
}

function Tableau({ supabase, rep, setRep, slug }) {
  const marque = useMarque(supabase, slug);
  const ws = rep.workspace_id;
  const [onglet, setOnglet] = useState("missions");
  const [missions, setMissions] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [erreur, setErreur] = useState("");

  const chargerMissions = useCallback(async () => {
    try { setMissions((await rpc(supabase, "rn_rep_missions", { p_ws: ws })) || []); } catch (e) { setErreur(erreurTexte(e)); }
  }, [supabase, ws]);
  const chargerNotifs = useCallback(async () => {
    const { data } = await supabase.from("rn_notifications").select("*").eq("representant_id", rep.id).order("created_at", { ascending: false }).limit(40);
    setNotifs(data || []);
  }, [supabase, rep.id]);

  useEffect(() => {
    chargerMissions(); chargerNotifs();
    const t = setInterval(chargerMissions, 30000);
    // temps réel : nouvelle mission / annulation / réattribution
    const canal = supabase
      .channel("rn-rep-" + rep.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rn_notifications", filter: `representant_id=eq.${rep.id}` }, (p) => {
        chargerMissions(); chargerNotifs();
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
        if (window.Notification?.permission === "granted") new Notification(p.new.titre, { body: p.new.message || "" });
      })
      .subscribe();
    if (window.Notification?.permission === "default") Notification.requestPermission().catch(() => {});
    return () => { clearInterval(t); supabase.removeChannel(canal); };
  }, [supabase, rep.id, chargerMissions, chargerNotifs]);

  const aRepondre = missions.filter((m) => m.statut === "proposee").length;
  const nonLues = notifs.filter((n) => !n.lu).length;
  const basculer = async () => {
    try { await rpc(supabase, "rn_rep_disponible", { p_ws: ws, p_dispo: !rep.disponible }); setRep({ ...rep, disponible: !rep.disponible }); }
    catch (e) { setErreur(erreurTexte(e)); }
  };
  const onglets = [
    ["missions", "Missions", aRepondre],
    ["stock", "Mon stock"],
    ["proposer", "Proposer un article"],
    ["transferts", "Transferts"],
    ["inventaire", "Inventaire"],
    ["perf", "Mes résultats"],
    ["notifs", "Alertes", nonLues],
  ];

  return (
    <div className="rn rn-app">
      <div>
        <EnteteEspace logo={marque?.logo} plateforme={rep.boutique?.nom_plateforme} espace="Espace représentant" titre={rep.nom} droite={<>
            <label className="rn-interrupteur" style={{ color: "#fff" }}>
              <input type="checkbox" checked={rep.disponible} onChange={basculer} aria-label="Disponible pour des missions" />
              <span className="rn-petit">{rep.disponible ? "Disponible" : "Indisponible"}</span>
            </label>
            <button className="rn-btn rn-btn-petit" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }} onClick={() => supabase.auth.signOut()}>Quitter</button>
          </>} />
        <nav className="rn-onglets">
          {onglets.map(([k, l, n]) => (
            <button key={k} className="rn-onglet" aria-current={onglet === k ? "page" : undefined} onClick={() => { setOnglet(k); if (k === "notifs") marquerLues(supabase, notifs, chargerNotifs); }}>
              {l}{n ? <span className="rn-compteur">{n}</span> : null}
            </button>
          ))}
        </nav>
      </div>
      <main className="rn-zone-travail" style={{ maxWidth: 760 }}>
        <Message ton="danger" onFermer={() => setErreur("")}>{erreur}</Message>
        <BoutonAlertes supabase={supabase} workspaceId={ws} role="representant" />
        {!rep.disponible ? <Message ton="alerte">Vous êtes indiqué indisponible : aucune nouvelle mission ne vous sera proposée.</Message> : null}
        {onglet === "missions" ? <Missions supabase={supabase} ws={ws} missions={missions} recharger={chargerMissions} /> : null}
        {onglet === "stock" ? <MonStock supabase={supabase} rep={rep} /> : null}
        {onglet === "proposer" ? <Proposer supabase={supabase} rep={rep} fini={() => setOnglet("stock")} /> : null}
        {onglet === "transferts" ? <Transferts supabase={supabase} rep={rep} /> : null}
        {onglet === "inventaire" ? <Inventaire supabase={supabase} rep={rep} /> : null}
        {onglet === "perf" ? (
          <>
            <CarteRepresentant logo={marque?.logo} plateforme={rep.boutique?.nom_plateforme} nom={rep.nom} zone={rep.zone} depuis={rep.created_at} reference={rep.id?.slice(0, 8).toUpperCase()} />
            <Resultats supabase={supabase} rep={rep} missions={missions} />
          </>
        ) : null}
        {onglet === "notifs" ? (
          notifs.length ? (
            <div className="rn-pile">
              {notifs.map((n) => (
                <div key={n.id} className="rn-carte">
                  <div className="rn-entre"><b>{n.titre}</b><span className="rn-muet rn-petit">{fmtDate(n.created_at)}</span></div>
                  {n.message ? <p className="rn-petit" style={{ marginTop: 4 }}>{n.message}</p> : null}
                </div>
              ))}
            </div>
          ) : <Vide titre="Aucune alerte">Les nouvelles missions et annulations apparaîtront ici.</Vide>
        ) : null}
      </main>
    </div>
  );
}

async function marquerLues(supabase, notifs, recharger) {
  const ids = notifs.filter((n) => !n.lu).map((n) => n.id);
  if (ids.length) { await supabase.from("rn_notifications").update({ lu: true }).in("id", ids); recharger(); }
}

// ------------------------------------------------------------------ missions
function Missions({ supabase, ws, missions, recharger }) {
  const [filtre, setFiltre] = useState("actives");
  const actives = missions.filter((m) => ["proposee", "acceptee", "en_preparation", "en_cours"].includes(m.statut));
  const liste = filtre === "actives" ? actives : missions.filter((m) => !actives.includes(m));
  return (
    <>
      <div className="rn-ligne">
        <button className="rn-cat" aria-pressed={filtre === "actives"} onClick={() => setFiltre("actives")}>En cours ({actives.length})</button>
        <button className="rn-cat" aria-pressed={filtre === "historique"} onClick={() => setFiltre("historique")}>Historique</button>
      </div>
      {liste.length ? (
        liste.map((m) => <CarteMission key={m.id} supabase={supabase} ws={ws} m={m} recharger={recharger} />)
      ) : (
        <Vide titre={filtre === "actives" ? "Aucune mission pour le moment" : "Pas encore d'historique"}>
          {filtre === "actives" ? "Gardez cette page ouverte : une alerte s'affiche dès qu'une livraison vous est proposée." : null}
        </Vide>
      )}
    </>
  );
}

function CarteMission({ supabase, ws, m, recharger }) {
  const c = m.commande;
  const reste = useCompteARebours(m.statut === "proposee" ? m.expire_at : null);
  const [modale, setModale] = useState(null);
  const [f, setF] = useState({ motif: "", code: "", montant: "" });
  const [erreur, setErreur] = useState("");
  const [charge, setCharge] = useState(false);
  const agir = async (nom, args, apres) => {
    setCharge(true); setErreur("");
    try {
      const r = await rpc(supabase, nom, { p_mission: m.id, ...args });
      if (r && r.ok === false) { setErreur(r.message); return; }
      setModale(null); apres?.(r); recharger();
    } catch (e) { setErreur(erreurTexte(e)); recharger(); } finally { setCharge(false); }
  };
  const st = STATUTS_MISSION[m.statut] || {};
  const active = ["acceptee", "en_preparation", "en_cours"].includes(m.statut);
  const carte = c.lat && c.lng ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : null;

  return (
    <article className="rn-carte rn-mission" style={m.statut === "proposee" ? { borderColor: "var(--rn-or)", borderWidth: 2 } : null}>
      <div className="rn-mission-tete">
        <div>
          <b>{c.numero}</b>
          <p className="rn-muet rn-petit">
            {c.zone}{m.distance_km != null ? `, à ${m.distance_km} km` : ""}{c.type_livraison === "interurbaine" ? ", envoi interurbain" : ""}
          </p>
          {c.express ? <Pastille ton="danger">EXPRESS</Pastille> : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <Pastille ton={st.ton}>{st.label}</Pastille>
          {m.statut === "proposee" ? <p className="rn-chrono rn-petit" style={{ marginTop: 4 }}>{reste > 0 ? `Répondre avant ${formatDuree(reste)}` : "Délai dépassé"}</p> : null}
        </div>
      </div>

      {c.livraison_modifiee_at && active ? <Message ton="alerte">Livraison modifiée par l'administration le {fmtDate(c.livraison_modifiee_at)} : vérifiez l'adresse et le téléphone.</Message> : null}
      {c.date_livraison_souhaitee && m.statut !== "terminee" ? (
        <p className="rn-petit"><b>Livraison souhaitée le {new Date(c.date_livraison_souhaitee + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b></p>
      ) : null}
      {(m.lignes || []).map((l, i) => (
        <div className="rn-mini-article" key={i}>
          {l.photo ? <img src={l.photo} alt="" /> : <span />}
          <span>{l.titre}{l.taille ? `, taille ${l.taille}` : ""}<br /><span className="rn-muet rn-petit">Réf. {l.reference}{l.quantite > 1 ? ` × ${l.quantite}` : ""}</span></span>
          <span className="rn-num">{fmt(l.prix * l.quantite)}</span>
        </div>
      ))}

      {c.mode_paiement === "cod" && m.statut !== "terminee" ? (
        <div className="rn-entre" style={{ background: "#FBF5E8", padding: "10px 12px", borderRadius: 12 }}>
          <span>À encaisser auprès du client</span><b>{fmt(c.a_encaisser)}</b>
        </div>
      ) : m.statut !== "terminee" ? (
        <p className="rn-petit" style={{ color: "var(--rn-vert)", fontWeight: 600 }}>Déjà payé par {MODES_PAIEMENT[c.mode_paiement]?.court} : rien à encaisser.</p>
      ) : null}

      {active ? (
        <div className="rn-pile" style={{ gap: 8, background: "var(--rn-rose)", padding: 12, borderRadius: 12 }}>
          <b>{c.client_nom}</b>
          <span>{c.adresse || "Adresse non précisée"}{c.repere ? `. Repère : ${c.repere}` : ""}</span>
          {c.note_client ? <span className="rn-petit">Message : {c.note_client}</span> : null}
          <div className="rn-ligne">
            <a className="rn-btn rn-btn-plein rn-btn-petit" href={telLien(c.client_tel)}>Appeler</a>
            <a className="rn-btn rn-btn-contour rn-btn-petit" href={lienWhatsApp(c.client_tel, `Bonjour ${c.client_nom}, je suis votre livreur pour la commande ${c.numero}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
            {carte ? <a className="rn-btn rn-btn-discret rn-btn-petit" href={carte} target="_blank" rel="noreferrer">Itinéraire</a> : null}
          </div>
        </div>
      ) : null}

      {m.transporteur ? <p className="rn-petit">Confié à <b>{m.transporteur}</b>{m.numero_colis ? `, colis n° ${m.numero_colis}` : ""}</p> : null}
      {m.statut === "terminee" ? (
        <p className="rn-petit rn-muet">Livrée le {fmtDate(m.termine_at)}{m.commission ? `, commission ${fmt(m.commission)}` : ""}</p>
      ) : null}
      {m.preuves?.length ? <div className="rn-preuves">{m.preuves.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.type === "signature" ? "Signature du client" : "Photo de remise"} /></a>)}</div> : null}
      {["refusee", "expiree", "echec", "annulee"].includes(m.statut) && m.motif ? <p className="rn-petit rn-muet">{m.motif}</p> : null}

      <Message ton="danger">{erreur}</Message>
      {m.statut === "proposee" ? (
        <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
          <Bouton variante="discret" className="rn-btn-bloc" onClick={() => setModale("refus")}>Refuser</Bouton>
          <Bouton className="rn-btn-bloc" chargement={charge} onClick={() => agir("rn_rep_repondre", { p_accepte: true })}>Accepter</Bouton>
        </div>
      ) : null}
      {active ? (
        <div className="rn-ligne">
          {m.statut === "acceptee" ? <Bouton variante="discret" petit chargement={charge} onClick={() => agir("rn_rep_avancer", { p_statut: "en_preparation" })}>Je prépare</Bouton> : null}
          {m.statut !== "en_cours" ? <Bouton variante="contour" petit chargement={charge} onClick={() => agir("rn_rep_avancer", { p_statut: "en_cours" })}>Je pars livrer</Bouton> : null}
          {c.type_livraison === "interurbaine" && !m.transporteur ? <Bouton variante="contour" petit onClick={() => setModale("expedier")}>Confier au transporteur</Bouton> : null}
          <Bouton variante="vert" petit onClick={() => { setF({ ...f, montant: String(c.a_encaisser || ""), photo: null, signature: null }); setModale("livrer"); }}>Remettre l'article</Bouton>
          <Bouton variante="danger" petit onClick={() => setModale("echec")}>Livraison impossible</Bouton>
        </div>
      ) : null}

      {modale === "refus" ? (
        <Modale titre="Refuser la mission" onFermer={() => setModale(null)}>
          <p>La livraison sera proposée au représentant suivant.</p>
          <Champ label="Motif (facultatif)"><input value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} placeholder="Ex. absent aujourd'hui" /></Champ>
          <Message ton="danger">{erreur}</Message>
          <Bouton variante="danger" chargement={charge} onClick={() => agir("rn_rep_repondre", { p_accepte: false, p_motif: f.motif })}>Confirmer le refus</Bouton>
        </Modale>
      ) : null}
      {modale === "livrer" ? (
        <Modale titre="Remise de l'article" onFermer={() => setModale(null)}>
          <p>Demandez au client son <b>code à 6 chiffres</b>. Il est affiché sur sa page de suivi.</p>
          <Champ label="Code du client">
            <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "") })}
              style={{ fontSize: 28, letterSpacing: ".3em", textAlign: "center" }} />
          </Champ>
          {c.mode_paiement === "cod" ? (
            <Champ label="Montant encaissé (FCFA)" aide={`Montant dû : ${fmt(c.a_encaisser)}`}>
              <input inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value.replace(/\D/g, "") })} />
            </Champ>
          ) : null}
          <Champ label="Photo de la remise" aide="L'article entre les mains du client, ou le colis déposé.">
            <div className="rn-ligne">
              {f.photo ? <img src={URL.createObjectURL(f.photo)} alt="Photo de remise" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} /> : null}
              <label className="rn-btn rn-btn-contour rn-btn-petit" style={{ position: "relative", overflow: "hidden" }}>
                {f.photo ? "Reprendre la photo" : "Prendre une photo"}
                <input type="file" accept="image/*" capture="environment" style={{ position: "absolute", inset: 0, opacity: 0 }}
                  onChange={async (e) => { const fi = e.target.files?.[0]; if (fi) setF({ ...f, photo: await compresserImage(fi, 1200, 0.78) }); e.target.value = ""; }} />
              </label>
            </div>
          </Champ>
          <Champ label="Signature du client (facultatif)">
            <PadSignature onChange={(b) => setF((x) => ({ ...x, signature: b }))} />
          </Champ>
          <Message ton="danger">{erreur}</Message>
          <Bouton variante="vert" chargement={charge} disabled={f.code.length !== 6}
            onClick={async () => {
              setCharge(true); setErreur("");
              try {
                const preuves = [];
                if (f.photo) preuves.push({ type: "photo", url: await envoyerPreuve(supabase, ws, f.photo, "jpg") });
                if (f.signature) preuves.push({ type: "signature", url: await envoyerPreuve(supabase, ws, f.signature, "png") });
                await agir("rn_rep_remettre", { p_code: f.code, p_montant: c.mode_paiement === "cod" ? Number(f.montant) : null, p_preuves: preuves });
              } catch (e) { setErreur(erreurTexte(e)); setCharge(false); }
            }}>
            Confirmer la livraison
          </Bouton>
        </Modale>
      ) : null}
      {modale === "expedier" ? (
        <Modale titre="Confier le colis au transporteur" onFermer={() => setModale(null)}>
          <p>Pour un envoi vers une autre ville. Le client verra le nom du transporteur et le numéro du colis sur sa page de suivi.</p>
          <Champ label="Transporteur"><input value={f.transporteur || ""} onChange={(e) => setF({ ...f, transporteur: e.target.value })} placeholder="Ex. UTB, STC, AVS…" list="rn-transporteurs" /></Champ>
          <datalist id="rn-transporteurs"><option>UTB</option><option>STC</option><option>AVS</option><option>Sonef</option><option>GTI</option><option>Fabiola</option></datalist>
          <Champ label="Numéro du colis ou du reçu (facultatif)"><input value={f.numero || ""} onChange={(e) => setF({ ...f, numero: e.target.value })} /></Champ>
          <Message ton="danger">{erreur}</Message>
          <Bouton chargement={charge} disabled={(f.transporteur || "").trim().length < 2} onClick={() => agir("rn_rep_expedier", { p_transporteur: f.transporteur, p_numero: f.numero || null })}>Enregistrer l'envoi</Bouton>
        </Modale>
      ) : null}
      {modale === "echec" ? (
        <Modale titre="Livraison impossible" onFermer={() => setModale(null)}>
          <p>L'article redevient disponible dans votre stock et l'administration est prévenue.</p>
          <Champ label="Que s'est-il passé ?">
            <select value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })}>
              <option value="">Choisir…</option>
              <option>Client injoignable</option>
              <option>Client absent à l'adresse</option>
              <option>Client a refusé l'article</option>
              <option>Adresse introuvable</option>
              <option>Article endommagé avant la livraison</option>
              <option>Autre</option>
            </select>
          </Champ>
          <Message ton="danger">{erreur}</Message>
          <Bouton variante="danger" chargement={charge} disabled={!f.motif} onClick={() => agir("rn_rep_echec", { p_motif: f.motif })}>Signaler l'échec</Bouton>
        </Modale>
      ) : null}
    </article>
  );
}

// ------------------------------------------------------------------ stock
function MonStock({ supabase, rep }) {
  const [lignes, setLignes] = useState(null);
  const [edit, setEdit] = useState(null);
  const [transfert, setTransfert] = useState(null);
  const [collegues, setCollegues] = useState([]);
  const [msg, setMsg] = useState({});
  useEffect(() => { rpc(supabase, "rn_rep_collegues", { p_ws: rep.workspace_id }).then((d) => setCollegues(d || [])).catch(() => {}); }, [supabase, rep.workspace_id]);
  const demanderTransfert = async () => {
    try {
      await rpc(supabase, "rn_rep_demander_transfert", { p_article: transfert.article.id, p_vers: transfert.vers || null, p_q: Number(transfert.q), p_note: transfert.note || null });
      setTransfert(null); setMsg({ ton: "ok", texte: "Demande de transfert envoyée à l'administration." });
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const charger = useCallback(async () => {
    const { data, error } = await supabase.from("rn_stocks").select("*, article:rn_articles(*)").eq("representant_id", rep.id).order("updated_at", { ascending: false });
    if (error) setMsg({ ton: "danger", texte: erreurTexte(error) });
    setLignes(data || []);
  }, [supabase, rep.id]);
  useEffect(() => { charger(); }, [charger]);
  const mouvement = async () => {
    try {
      await rpc(supabase, "rn_stock_mouvement", { p_article: edit.article.id, p_rep: rep.id, p_type: edit.type, p_q: Number(edit.q), p_note: edit.note || null });
      setEdit(null); setMsg({ ton: "ok", texte: "Stock mis à jour." }); charger();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  if (!lignes) return <span className="rn-spin" />;
  const visibles = lignes.filter((l) => l.quantite > 0 || l.article?.statut === "en_attente");
  return (
    <>
      <div className="rn-entre">
        <h2>Mon stock</h2>
        <span className="rn-muet">{visibles.reduce((s, l) => s + l.quantite, 0)} pièce(s)</span>
      </div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      {visibles.length ? visibles.map((l) => (
        <div className="rn-carte rn-mini-article" key={l.id} style={{ gridTemplateColumns: "52px 1fr auto" }}>
          {l.article?.photos?.[0] ? <img src={l.article.photos[0]} alt="" /> : <span />}
          <span>
            <b>{l.article?.titre}</b><br />
            <span className="rn-muet rn-petit">Réf. {l.article?.reference}, {fmt(l.article?.prix)}</span><br />
            <Pastille ton={STATUTS_ARTICLE[l.article?.statut]?.ton}>{STATUTS_ARTICLE[l.article?.statut]?.label}</Pastille>{" "}
            {l.reservee ? <Pastille ton="info">{l.reservee} réservé(s)</Pastille> : null}
          </span>
          <span style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            <b style={{ fontSize: 20 }}>{l.quantite}</b>
            <Bouton variante="discret" petit onClick={() => setEdit({ article: l.article, type: "sortie", q: 1, note: "" })}>Mouvement</Bouton>
            {l.quantite - l.reservee > 0 ? <Bouton variante="discret" petit onClick={() => setTransfert({ article: l.article, q: 1, vers: "", note: "", max: l.quantite - l.reservee })}>Transférer</Bouton> : null}
          </span>
        </div>
      )) : <Vide titre="Aucun article chez vous">Les articles que l'administration vous confie ou que vous proposez apparaîtront ici.</Vide>}
      {edit ? (
        <Modale titre={edit.article.titre} onFermer={() => setEdit(null)}>
          <Champ label="Type de mouvement">
            <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              <option value="entree">Entrée (je reçois des pièces)</option>
              <option value="sortie">Sortie (pièce remise, perdue ou abîmée)</option>
              <option value="retour">Retour d'un client</option>
            </select>
          </Champ>
          <Champ label="Quantité"><input inputMode="numeric" value={edit.q} onChange={(e) => setEdit({ ...edit, q: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Champ label="Motif" aide="Visible par l'administration."><input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Champ>
          <Bouton disabled={!Number(edit.q)} onClick={mouvement}>Enregistrer</Bouton>
        </Modale>
      ) : null}
      {transfert ? (
        <Modale titre={`Transférer : ${transfert.article.titre}`} onFermer={() => setTransfert(null)}>
          <p className="rn-muet">L'administration valide la demande ; le stock est déplacé à ce moment-là.</p>
          <Champ label="Vers quel représentant ?">
            <select value={transfert.vers} onChange={(e) => setTransfert({ ...transfert, vers: e.target.value })}>
              <option value="">Laisser l'administration choisir</option>
              {collegues.map((r) => <option key={r.id} value={r.id}>{r.nom}{r.zone ? ` (${r.zone})` : ""}</option>)}
            </select>
          </Champ>
          <Champ label="Quantité" aide={`Disponible : ${transfert.max}`}><input inputMode="numeric" value={transfert.q} onChange={(e) => setTransfert({ ...transfert, q: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Champ label="Raison (facultatif)"><input value={transfert.note} onChange={(e) => setTransfert({ ...transfert, note: e.target.value })} placeholder="Ex. cliente intéressée à Bouaké" /></Champ>
          <Bouton disabled={!Number(transfert.q) || Number(transfert.q) > transfert.max} onClick={demanderTransfert}>Envoyer la demande</Bouton>
        </Modale>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ proposer un article
export function FormulaireArticle({ supabase, workspaceId, valeur, categories, onChange }) {
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState("");
  const maj = (k) => (e) => onChange({ ...valeur, [k]: e.target.value });
  const ajouterPhotos = async (e) => {
    const fichiers = [...e.target.files].slice(0, 8);
    if (!fichiers.length) return;
    setEnvoi(true); setErr("");
    try { onChange({ ...valeur, photos: [...(valeur.photos || []), ...(await envoyerPhotos(supabase, workspaceId, fichiers))] }); }
    catch (e2) { setErr("Envoi de photo impossible : " + erreurTexte(e2)); } finally { setEnvoi(false); e.target.value = ""; }
  };
  const cats = categories?.length ? categories : CATEGORIES_DEFAUT;
  return (
    <div className="rn-pile" style={{ gap: 14 }}>
      <Champ label="Photos réelles" aide="Face, dos, étiquette et chaque défaut. La première sert de photo principale.">
        <div className="rn-photos-saisie">
          {(valeur.photos || []).map((u, i) => (
            <div key={u}>
              <img src={u} alt={`Photo ${i + 1}`} />
              <button type="button" className="rn-x" aria-label="Retirer la photo" onClick={() => onChange({ ...valeur, photos: valeur.photos.filter((x) => x !== u) })}>×</button>
            </div>
          ))}
          <span className="rn-ajout-photo">
            {envoi ? <span className="rn-spin" /> : <>+ Photo</>}
            <input type="file" accept="image/*" multiple onChange={ajouterPhotos} style={{ position: "absolute", opacity: 0, width: 78, height: 96, cursor: "pointer" }} aria-label="Ajouter des photos" />
          </span>
        </div>
      </Champ>
      {err ? <Message ton="danger">{err}</Message> : null}
      <Champ label="Titre"><input value={valeur.titre || ""} onChange={maj("titre")} placeholder="Ex. Robe longue en pagne wax" /></Champ>
      <div className="rn-grille-2">
        <Champ label="Catégorie">
          <select value={valeur.categorie || cats[0]} onChange={maj("categorie")}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        </Champ>
        <Champ label="Sous-catégorie (facultatif)"><input value={valeur.sous_categorie || ""} onChange={maj("sous_categorie")} placeholder="Ex. Robes" /></Champ>
        <Champ label="Taille"><input value={valeur.taille || ""} onChange={maj("taille")} placeholder="M, 42, 6 ans…" /></Champ>
        <Champ label="Marque"><input value={valeur.marque || ""} onChange={maj("marque")} /></Champ>
        <Champ label="Couleur"><input value={valeur.couleur || ""} onChange={maj("couleur")} /></Champ>
        <Champ label="État">
          <select value={valeur.etat || "bon"} onChange={maj("etat")}>{Object.entries(ETATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Champ>
        <Champ label="Prix de vente (FCFA)"><input inputMode="numeric" value={valeur.prix ?? ""} onChange={(e) => onChange({ ...valeur, prix: e.target.value.replace(/\D/g, "") })} /></Champ>
        <Champ label="Prix neuf indicatif (facultatif)"><input inputMode="numeric" value={valeur.prix_barre ?? ""} onChange={(e) => onChange({ ...valeur, prix_barre: e.target.value.replace(/\D/g, "") })} /></Champ>
        <Champ label="Poids (kg, facultatif)" aide="Sert au calcul des frais d'envoi."><input inputMode="decimal" value={valeur.poids_kg ?? ""} onChange={(e) => onChange({ ...valeur, poids_kg: e.target.value.replace(",", ".").replace(/[^0-9.]/g, "") })} /></Champ>
      </div>
      <Champ label="Défauts visibles" aide="Tache, accroc, bouton manquant… Laisser vide s'il n'y en a aucun."><textarea value={valeur.defauts || ""} onChange={maj("defauts")} /></Champ>
      <Champ label="Description"><textarea value={valeur.description || ""} onChange={maj("description")} /></Champ>
    </div>
  );
}

function Proposer({ supabase, rep, fini }) {
  const [cats, setCats] = useState([]);
  const [v, setV] = useState({ etat: "bon", quantite: 1, photos: [] });
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    supabase.from("rn_categories").select("nom").eq("workspace_id", rep.workspace_id).is("parent_id", null).order("ordre")
      .then(({ data }) => setCats((data || []).map((c) => c.nom)));
  }, [supabase, rep.workspace_id]);
  const envoyer = async () => {
    setCharge(true); setMsg({});
    try {
      await rpc(supabase, "rn_rep_proposer_article", { p_ws: rep.workspace_id, p: { ...v, categorie: v.categorie || cats[0], prix: Number(v.prix), prix_barre: v.prix_barre ? Number(v.prix_barre) : null } });
      setMsg({ ton: "ok", texte: "Article envoyé. Il sera en vente dès sa validation par l'administration." });
      setV({ etat: "bon", quantite: 1, photos: [] });
      setTimeout(fini, 1500);
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); } finally { setCharge(false); }
  };
  return (
    <div className="rn-pile" style={{ gap: 16 }}>
      <h2>Proposer un article</h2>
      <FormulaireArticle supabase={supabase} workspaceId={rep.workspace_id} valeur={v} categories={cats} onChange={setV} />
      <Champ label="Nombre de pièces identiques"><input inputMode="numeric" value={v.quantite} onChange={(e) => setV({ ...v, quantite: e.target.value.replace(/\D/g, "") })} /></Champ>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton chargement={charge} disabled={!v.titre || !v.prix || !v.photos?.length} onClick={envoyer}>Envoyer pour validation</Bouton>
    </div>
  );
}

// ------------------------------------------------------------------ inventaire
function Inventaire({ supabase, rep }) {
  const [lignes, setLignes] = useState(null);
  const [reel, setReel] = useState({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState({});
  const [historique, setHistorique] = useState([]);
  const charger = useCallback(async () => {
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase.from("rn_stocks").select("article_id, quantite, article:rn_articles(titre, reference, photos)").eq("representant_id", rep.id).gt("quantite", 0),
      supabase.from("rn_inventaires").select("*").eq("representant_id", rep.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setLignes(s || []); setHistorique(h || []);
  }, [supabase, rep.id]);
  useEffect(() => { charger(); }, [charger]);
  const envoyer = async () => {
    try {
      await rpc(supabase, "rn_rep_inventaire", {
        p_ws: rep.workspace_id,
        p_lignes: lignes.map((l) => ({ article_id: l.article_id, reel: reel[l.article_id] === undefined || reel[l.article_id] === "" ? l.quantite : Number(reel[l.article_id]) })),
        p_note: note || null,
      });
      setMsg({ ton: "ok", texte: "Inventaire envoyé à l'administration." }); setReel({}); setNote(""); charger();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  if (!lignes) return <span className="rn-spin" />;
  return (
    <>
      <h2>Inventaire physique</h2>
      <p className="rn-muet">Comptez les pièces réellement présentes chez vous. Ne modifiez que les lignes où le nombre diffère.</p>
      {lignes.length ? (
        <div className="rn-table-boite">
          <table className="rn-table">
            <thead><tr><th>Article</th><th className="rn-num">Enregistré</th><th className="rn-num">Compté</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.article_id}>
                  <td>{l.article?.titre}<br /><span className="rn-muet rn-petit">Réf. {l.article?.reference}</span></td>
                  <td className="rn-num">{l.quantite}</td>
                  <td className="rn-num"><input inputMode="numeric" style={{ width: 74, textAlign: "right" }} placeholder={String(l.quantite)} value={reel[l.article_id] ?? ""} onChange={(e) => setReel({ ...reel, [l.article_id]: e.target.value.replace(/\D/g, "") })} aria-label={`Quantité comptée pour ${l.article?.titre}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vide titre="Rien à compter">Votre stock est vide.</Vide>}
      <Champ label="Commentaire (facultatif)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Champ>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton onClick={envoyer} disabled={!lignes.length}>Envoyer l'inventaire</Bouton>
      {historique.length ? (
        <div className="rn-pile">
          <h3>Inventaires précédents</h3>
          {historique.map((h) => (
            <div key={h.id} className="rn-entre rn-carte">
              <span>{fmtDate(h.created_at)}{h.ecart_total ? `, ${h.ecart_total} écart(s)` : ", aucun écart"}</span>
              <Pastille ton={h.statut === "valide" ? "ok" : h.statut === "rejete" ? "danger" : "info"}>{{ soumis: "En revue", valide: "Validé", rejete: "Rejeté" }[h.statut]}</Pastille>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Resultats({ supabase, rep, missions }) {
  const [s, setS] = useState(null);
  useEffect(() => { rpc(supabase, "rn_rep_stats", { p_ws: rep.workspace_id }).then(setS).catch(() => setS({})); }, [supabase, rep.workspace_id, missions.length]);
  if (!s) return <span className="rn-spin" />;
  const kpis = [
    ["Livraisons (30 jours)", s.livrees_30j],
    ["Commissions (30 jours)", fmt(s.commissions_30j)],
    ["Commissions totales", fmt(s.commissions_total)],
    ["Encaissé à reverser", fmt(s.encaisse_non_reverse)],
    ["Pièces en stock", s.stock_articles],
    ["Valeur de mon stock", fmt(s.stock_valeur)],
    ["Refus ou sans réponse (30 j)", s.refusees_30j],
    ["Délai moyen de livraison", s.delai_moyen_h != null ? `${s.delai_moyen_h} h` : "—"],
  ];
  return (
    <>
      <h2>Mes résultats</h2>
      <div className="rn-kpis">
        {kpis.map(([l, v]) => (
          <div className="rn-kpi" key={l}><div className="rn-kpi-lab">{l}</div><div className="rn-kpi-val">{v ?? 0}</div></div>
        ))}
      </div>
      {s.zone ? (
        <div className="rn-carte rn-pile" style={{ gap: 8 }}>
          <h3>Ma zone{s.zone.nom ? ` : ${s.zone.nom}` : ""} (30 jours)</h3>
          <div className="rn-kpis">
            <div className="rn-kpi"><div className="rn-kpi-lab">Commandes</div><div className="rn-kpi-val">{s.zone.commandes_30j ?? 0}</div></div>
            <div className="rn-kpi"><div className="rn-kpi-lab">Livrées</div><div className="rn-kpi-val">{s.zone.livrees_30j ?? 0}</div></div>
            <div className="rn-kpi"><div className="rn-kpi-lab">Ventes livrées</div><div className="rn-kpi-val">{fmt(s.zone.ca_30j)}</div></div>
            <div className="rn-kpi"><div className="rn-kpi-lab">Taux de réussite</div><div className="rn-kpi-val">{s.zone.taux_reussite != null ? `${s.zone.taux_reussite} %` : "—"}</div></div>
          </div>
          {s.rang ? <p className="rn-petit">Classement du réseau : <b>{s.rang}<sup>{s.rang === 1 ? "er" : "e"}</sup></b> sur {s.nb_representants} représentants (livraisons sur 30 jours).</p> : null}
        </div>
      ) : null}
      {s.encaisse_non_reverse > 0 ? <Message ton="alerte">Pensez à reverser {fmt(s.encaisse_non_reverse)} encaissés auprès des clients, selon les consignes de l'administration.</Message> : null}
    </>
  );
}

// ------------------------------------------------------------------ transferts
function Transferts({ supabase, rep }) {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState("");
  useEffect(() => { rpc(supabase, "rn_rep_mes_transferts", { p_ws: rep.workspace_id }).then((d) => setListe(d || [])).catch((e) => { setErreur(erreurTexte(e)); setListe([]); }); }, [supabase, rep.workspace_id]);
  if (!liste) return <span className="rn-spin" />;
  const libelle = { demande: ["En attente", "alerte"], valide: ["Validé", "ok"], refuse: ["Refusé", "danger"], en_cours: ["En cours", "info"], recu: ["Reçu", "ok"] };
  return (
    <>
      <h2>Transferts de stock</h2>
      <p className="rn-muet">Pour envoyer une pièce à un collègue, ouvrez « Mon stock » puis « Transférer ».</p>
      <Message ton="danger">{erreur}</Message>
      {liste.length ? liste.map((t) => (
        <div className="rn-carte rn-entre" key={t.id}>
          <span>
            <b>{t.article}</b> × {t.quantite}<br />
            <span className="rn-muet rn-petit">
              {t.sens === "sortant" ? `Vers ${t.autre || "représentant à choisir par l'administration"}` : `Depuis ${t.autre}`}, {fmtDate(t.date)}
            </span>
            {t.note ? <><br /><span className="rn-petit">{t.note}</span></> : null}
          </span>
          <Pastille ton={(libelle[t.statut] || [])[1]}>{(libelle[t.statut] || [t.statut])[0]}</Pastille>
        </div>
      )) : <Vide titre="Aucun transfert">Vos demandes et les pièces qui vous sont envoyées apparaîtront ici.</Vide>}
    </>
  );
}
