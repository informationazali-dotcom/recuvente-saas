import React, { useState, useEffect, useMemo } from "react";

// Outils gratuits : calculateur de rentabilité du paiement à la livraison + gains d'ambassadeur.
// Aucun chiffre inventé : les valeurs de départ sont des EXEMPLES modifiables, les prix des abonnements viennent du serveur.
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => Math.round(v).toLocaleString("fr-FR");

const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 18, marginBottom: 16 };
const champ = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 15, boxSizing: "border-box" };
const etiquette = { fontSize: 12, color: "#6B7168", margin: "10px 0 4px", display: "block" };

function Champ({ label, valeur, set, suffixe, aide }) {
  return (
    <div>
      <label style={etiquette}>{label}</label>
      <div style={{ position: "relative" }}>
        <input inputMode="decimal" value={valeur} onChange={(e) => set(e.target.value.replace(",", "."))} style={{ ...champ, paddingRight: suffixe ? 54 : 12 }} />
        {suffixe && <span style={{ position: "absolute", right: 12, top: 11, fontSize: 13, color: "#8A9089" }}>{suffixe}</span>}
      </div>
      {aide && <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 3 }}>{aide}</div>}
    </div>
  );
}

function CalculateurRentabilite() {
  const [prix, setPrix] = useState("15000");
  const [cout, setCout] = useState("5000");
  const [livraison, setLivraison] = useState("1500");
  const [retour, setRetour] = useState("1500");
  const [pub, setPub] = useState("1000");
  const [conf, setConf] = useState("60");
  const [liv, setLiv] = useState("75");

  const r = useMemo(() => {
    const N = 100, c = Math.min(100, Math.max(0, n(conf))) / 100, l = Math.min(100, Math.max(0, n(liv))) / 100;
    const confirmees = N * c, livrees = confirmees * l, retours = confirmees - livrees;
    const ca = livrees * n(prix), produits = livrees * n(cout), fraisLiv = livrees * n(livraison), fraisRet = retours * n(retour), fraisPub = N * n(pub);
    const benefice = ca - produits - fraisLiv - fraisRet - fraisPub;
    // Taux de livraison minimum pour ne pas perdre d'argent (0 % de bénéfice)
    const gainUnitaire = n(prix) - n(cout) - n(livraison);
    const denom = gainUnitaire + n(retour);
    const seuil = c > 0 && denom > 0 ? ((n(pub) / c) + n(retour)) / denom : null;
    return { confirmees, livrees, retours, ca, produits, fraisLiv, fraisRet, fraisPub, benefice, parCommande: benefice / N, seuil };
  }, [prix, cout, livraison, retour, pub, conf, liv]);

  const bon = r.benefice >= 0;
  return (
    <div style={carte}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>🧮 Ma vente à la livraison est-elle rentable ?</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginTop: 4, lineHeight: 1.5 }}>Calcul pour <b>100 commandes reçues</b>. Les chiffres ci-dessous sont des exemples : remplacez-les par les vôtres.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 14px" }}>
        <Champ label="Prix de vente" valeur={prix} set={setPrix} suffixe="F" />
        <Champ label="Coût du produit (achat + import)" valeur={cout} set={setCout} suffixe="F" />
        <Champ label="Frais de livraison (par colis livré)" valeur={livraison} set={setLivraison} suffixe="F" />
        <Champ label="Frais perdus par colis refusé / retourné" valeur={retour} set={setRetour} suffixe="F" aide="Souvent le prix de la course du livreur" />
        <Champ label="Coût de pub par commande reçue" valeur={pub} set={setPub} suffixe="F" aide="Budget pub ÷ nombre de commandes" />
        <Champ label="Commandes confirmées par téléphone" valeur={conf} set={setConf} suffixe="%" />
        <Champ label="Colis réellement livrés (parmi les confirmés)" valeur={liv} set={setLiv} suffixe="%" />
      </div>

      <div style={{ marginTop: 18, borderRadius: 14, padding: 16, background: bon ? "#F1F8EC" : "#FBEAE6", border: `1px solid ${bon ? "#C7DDA3" : "#F0B8AC"}` }}>
        <div style={{ fontSize: 12.5, color: "#6B7168" }}>Bénéfice sur 100 commandes reçues</div>
        <div style={{ fontWeight: 800, fontSize: 30, color: bon ? "#1a7a3c" : "#B23A26" }}>{r.benefice >= 0 ? "+" : "−"}{fmt(Math.abs(r.benefice))} F</div>
        <div style={{ fontSize: 13, color: "#4B524B", marginTop: 2 }}>soit <b>{r.parCommande >= 0 ? "+" : "−"}{fmt(Math.abs(r.parCommande))} F</b> par commande reçue · {fmt(r.livrees)} livrées · {fmt(r.retours)} retours</div>
      </div>
      <div style={{ fontSize: 13, color: "#4B524B", lineHeight: 1.7, marginTop: 12 }}>
        <div>Chiffre d'affaires encaissé : <b>{fmt(r.ca)} F</b></div>
        <div>− Produits : {fmt(r.produits)} F · Livraisons : {fmt(r.fraisLiv)} F · Retours : {fmt(r.fraisRet)} F · Publicité : {fmt(r.fraisPub)} F</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55 }}>
        {r.seuil === null ? "Avec ces chiffres, chaque colis livré ne rapporte pas assez : revoyez le prix ou les coûts." : r.seuil > 1 ? <>⚠️ Même avec 100 % de colis livrés, cette vente perd de l'argent : le coût de pub est trop élevé pour ce prix.</> : <>👉 Vous êtes rentable à partir de <b>{Math.ceil(r.seuil * 100)} %</b> de colis livrés parmi les confirmés.</>}
      </div>
      <div style={{ fontSize: 12, color: "#8A9089", marginTop: 10 }}>Chaque colis refusé coûte cher : c'est pourquoi RecuVente suit vos confirmations, vos livreurs et vos retours, et prévient quand un numéro a déjà refusé ailleurs.</div>
    </div>
  );
}

function CalculateurAmbassadeur() {
  const [info, setInfo] = useState(null);
  const [nb, setNb] = useState("5");
  const [prixLibre, setPrixLibre] = useState("");
  const [plan, setPlan] = useState(0);
  useEffect(() => { fetch("/api/facebook-capi?croissance=1").then((r) => (r.ok ? r.json() : null)).then(setInfo).catch(() => setInfo(null)); }, []);
  const taux = info?.ambassadeur?.taux ?? 20, mois = info?.ambassadeur?.mois ?? 12;
  const plans = info?.plans || [];
  const prix = plans.length ? plans[Math.min(plan, plans.length - 1)].prix : n(prixLibre);
  const devise = plans.length ? (plans[Math.min(plan, plans.length - 1)].devise === "XOF" ? "F CFA" : plans[Math.min(plan, plans.length - 1)].devise) : "F CFA";
  const parMois = n(nb) * prix * (taux / 100);
  return (
    <div style={carte}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>🤝 Combien peut me rapporter le programme ambassadeur ?</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginTop: 4, lineHeight: 1.5 }}>Vous recommandez RecuVente : à chaque abonnement payé par une boutique que vous avez amenée, vous gagnez <b>{taux} %</b> du prix pendant <b>{mois} mois</b>.</div>
      <Champ label="Nombre de boutiques abonnées que vous amenez" valeur={nb} set={setNb} />
      {plans.length > 0 ? (
        <div>
          <label style={etiquette}>Abonnement choisi par ces boutiques</label>
          <select value={plan} onChange={(e) => setPlan(Number(e.target.value))} style={champ}>
            {plans.map((p, i) => <option key={p.nom} value={i}>{p.nom} — {fmt(p.prix)} {p.devise === "XOF" ? "F CFA" : p.devise} / mois</option>)}
          </select>
        </div>
      ) : (
        <Champ label="Prix de l'abonnement par mois" valeur={prixLibre} set={setPrixLibre} suffixe="F" />
      )}
      <div style={{ marginTop: 16, borderRadius: 14, padding: 16, background: "#FFF8E7", border: "1px solid #F5E2A9" }}>
        <div style={{ fontSize: 12.5, color: "#6B7168" }}>Vous gagneriez par mois</div>
        <div style={{ fontWeight: 800, fontSize: 28, color: "#8A6412" }}>{fmt(parMois)} {devise}</div>
        <div style={{ fontSize: 13, color: "#4B524B" }}>soit {fmt(parMois * mois)} {devise} sur {mois} mois, tant que ces boutiques restent abonnées.</div>
      </div>
      <div style={{ fontSize: 12, color: "#8A9089", marginTop: 10 }}>Simple calcul : ce n'est pas une promesse de revenus, cela dépend des boutiques que vous convainquez. Votre lien personnel se trouve dans l'application, section « Paiement en ligne & croissance → Ambassadeur ».</div>
    </div>
  );
}

export default function OutilsPublic() {
  useEffect(() => { document.title = "Outils gratuits — RecuVente"; }, []);
  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16231F" }}>
      <div style={{ background: "#0F3D26", color: "white", padding: "30px 18px 26px", textAlign: "center" }}>
        <a href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>← RecuVente</a>
        <h1 style={{ fontSize: 26, margin: "10px 0 6px", fontWeight: 800 }}>Outils gratuits pour vendeurs</h1>
        <p style={{ margin: "0 auto", maxWidth: 460, fontSize: 14.5, lineHeight: 1.55, color: "rgba(255,255,255,0.82)" }}>Vérifiez si votre vente à la livraison est rentable, sans rien installer.</p>
      </div>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px 40px" }}>
        <CalculateurRentabilite />
        <CalculateurAmbassadeur />
        <div style={{ ...carte, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Prêt à vendre sans perdre de colis ?</div>
          <div style={{ fontSize: 13.5, color: "#6B7168", margin: "6px 0 14px" }}>Commandes, closers, livreurs, relances et paiements en ligne (facultatif) dans une seule application.</div>
          <a href="/" style={{ display: "inline-block", background: "#1a7a3c", color: "white", textDecoration: "none", padding: "12px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}>Créer ma boutique gratuitement</a>
        </div>
      </div>
    </div>
  );
}
