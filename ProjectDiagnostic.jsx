import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import {
  OBJECTIFS_DIAGNOSTIC, OPTIONS_TRANCHE_CA, OPTIONS_TYPE_BOUTIQUE, OPTIONS_CANAUX, OPTIONS_PROBLEME,
  OPTIONS_TYPE_OFFRE_COACH, OPTIONS_CANAL_COACH, OPTIONS_PROBLEME_COACH,
  OPTIONS_A_DEJA_SYSTEME, OPTIONS_AMELIORER_ENTREPRISE, OPTIONS_NIVEAU_PROJET, OPTIONS_BUDGET_ENTREPRISE, OPTIONS_DEMARRAGE,
  diagnostiquerEcommerce, diagnostiquerCoach, diagnostiquerEntreprise,
} from "./diagnosticRules.js";

const NUMERO_WHATSAPP_DIAGNOSTIC = "0709281403"; // même numéro que la vitrine — à garder synchronisé si tu le changes

function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}

// Étapes par parcours (§5 e-commerce, §7 coach). "objectif" est commun et vient avant.
const ETAPES_PAR_PARCOURS = {
  ecommerce: ["boutique", "typeBoutique", "urlBoutique", "ca", "budgetPub", "canaux", "probleme", "commandes", "objectifRevenu", "analyse", "resume", "capture", "termine"],
  coach: ["typeOffre", "prixMoyen", "canalAcquisition", "avezTunnel", "prospectsMois", "ventesMois", "problemeCoach", "analyse", "resume", "capture", "termine"],
  entreprise: ["orgDescription", "problemeEntreprise", "personnesConcernees", "utilisateursEstimes", "hasSysteme", "ameliorer", "niveauProjet", "budgetEntreprise", "demarrage", "analyse", "resume", "capture", "termine"],
};

const cardStyle = { background: "#12121C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "white", textAlign: "left", transition: "border-color 0.2s ease, transform 0.15s ease" };
const inputStyle = { width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#0A0A12", color: "white", fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" };
const btnPrimaire = { background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "white", border: "none", borderRadius: 10, padding: "13px 24px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const btnFantome = { background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 12.5, cursor: "pointer", padding: "8px 0" };

function ChoixCartes({ options, valeur, onChoisir, multi }) {
  const estCoche = (o) => (multi ? (valeur || []).includes(o) : valeur === o);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((o) => (
        <div
          key={o}
          onClick={() => onChoisir(o)}
          style={{ ...cardStyle, borderColor: estCoche(o) ? "#7C3AED" : "rgba(255,255,255,0.1)", background: estCoche(o) ? "rgba(124,58,237,0.12)" : "#12121C" }}
        >
          {multi && <span style={{ marginRight: 8 }}>{estCoche(o) ? "☑" : "☐"}</span>}
          {o}
        </div>
      ))}
    </div>
  );
}

function EcranQuestion({ titre, sousTitre, enfants, onRetour, peutContinuer, onContinuer, cacherBouton }) {
  return (
    <div style={{ animation: "rvDiagFade 0.4s ease both" }}>
      <div style={{ fontSize: "clamp(19px,3vw,24px)", fontWeight: 800, marginBottom: sousTitre ? 6 : 22, color: "white" }}>{titre}</div>
      {sousTitre && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 22 }}>{sousTitre}</div>}
      {enfants}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        {onRetour ? <button onClick={onRetour} style={btnFantome}>← Revenir</button> : <span />}
        {onContinuer && (
          <button onClick={onContinuer} disabled={!peutContinuer} style={{ ...btnPrimaire, opacity: peutContinuer ? 1 : 0.4, cursor: peutContinuer ? "pointer" : "not-allowed" }}>
            Continuer
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProjectDiagnostic({ onFermer }) {
  const [etape, setEtape] = useState("objectif");
  const [objectif, setObjectif] = useState(null);
  const [reponses, setReponses] = useState({});
  const [capture, setCapture] = useState({ nom: "", entreprise: "", whatsapp: "", email: "", pays: "" });
  const [besoinLibre, setBesoinLibre] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [siteWebPiege, setSiteWebPiege] = useState(""); // honeypot anti-spam, jamais affiché
  const [diagnostic, setDiagnostic] = useState(null);

  const estEcommerce = objectif?.parcours === "ecommerce";
  const estCoach = objectif?.parcours === "coach";
  const estEntreprise = objectif?.parcours === "entreprise";
  const etapesParcours = objectif ? (ETAPES_PAR_PARCOURS[objectif.parcours] || null) : null;

  function maj(champ, valeur) {
    setReponses((r) => ({ ...r, [champ]: valeur }));
  }

  function toggleCanal(canal) {
    setReponses((r) => {
      const actuels = r.canaux || [];
      const nouveaux = actuels.includes(canal) ? actuels.filter((c) => c !== canal) : [...actuels, canal];
      return { ...r, canaux: nouveaux };
    });
  }

  function toggleAmeliorer(axe) {
    setReponses((r) => {
      const actuels = r.ameliorer || [];
      const nouveaux = actuels.includes(axe) ? actuels.filter((a) => a !== axe) : [...actuels, axe];
      return { ...r, ameliorer: nouveaux };
    });
  }

  function suivant(prochaine) {
    if (prochaine === "analyse") {
      const d = estCoach ? diagnostiquerCoach(reponses) : estEntreprise ? diagnostiquerEntreprise(reponses) : diagnostiquerEcommerce(reponses);
      setDiagnostic(d);
      setEtape("analyse");
      setTimeout(() => setEtape("resume"), 1100); // court temps de "traitement", pas un vrai calcul long
      return;
    }
    setEtape(prochaine);
  }

  async function soumettre() {
    if (!capture.nom.trim() || !capture.whatsapp.trim()) {
      setErreur("Merci de renseigner au moins ton nom et ton WhatsApp.");
      return;
    }
    setEnvoiEnCours(true);
    setErreur("");
    const recommandationTexte = diagnostic ? diagnostic.recommandations.join(", ") : null;
    const diagnosticTexte = diagnostic ? `${diagnostic.levierPrincipal} — ${diagnostic.defiTexte}` : null;
    const { error } = await supabase.rpc("soumettre_diagnostic_vitrine_publique", {
      p_nom: capture.nom,
      p_entreprise: capture.entreprise || null,
      p_whatsapp: capture.whatsapp,
      p_email: capture.email || null,
      p_pays: capture.pays || null,
      p_objective: objectif?.label || null,
      p_business_stage: reponses.avezBoutique || reponses.hasSysteme || null,
      p_platform: reponses.typeBoutique || null,
      p_store_url: reponses.urlBoutique || null,
      p_revenue_range: reponses.caMensuel || null,
      p_ad_spend_range: reponses.budgetPub || null,
      p_ad_channels: (reponses.canaux || []).join(", ") || reponses.canalAcquisition || null,
      p_pain_point: reponses.problemePrincipal || reponses.problemeCoach || reponses.problemeEntreprise || besoinLibre || null,
      p_monthly_orders: reponses.commandesMois || reponses.ventesMois || null,
      p_desired_revenue: reponses.objectifRevenu || null,
      p_offer_type: reponses.typeOffre || null,
      p_average_price: reponses.prixMoyen || null,
      p_has_funnel: reponses.avezTunnel || null,
      p_monthly_leads: reponses.prospectsMois || null,
      p_org_description: reponses.orgDescription || null,
      p_people_affected: reponses.personnesConcernees || null,
      p_estimated_users: reponses.utilisateursEstimes || null,
      p_improve_areas: (reponses.ameliorer || []).join(", ") || null,
      p_project_level: reponses.niveauProjet || null,
      p_start_timing: reponses.demarrage || null,
      p_qualification_score: diagnostic ? diagnostic.score : null,
      p_diagnostic: diagnosticTexte,
      p_recommendation: recommandationTexte,
      p_honeypot: siteWebPiege,
    });
    setEnvoiEnCours(false);
    if (error) {
      setErreur("Une erreur est survenue, réessaie ou contacte-nous directement sur WhatsApp.");
      return;
    }
    setEtape("termine");
  }

  const messageWhatsApp = objectif
    ? `Bonjour, je viens de terminer le diagnostic RecuVente. Mon projet concerne : ${objectif.label}.`
    : "Bonjour, je souhaite discuter d'un projet avec vous.";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,6,10,0.92)", backdropFilter: "blur(6px)", overflowY: "auto", display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <style>{`@keyframes rvDiagFade { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }`}</style>
      <div style={{ maxWidth: 560, width: "100%", height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={onFermer} style={{ ...btnFantome, fontSize: 20 }}>✕</button>
        </div>

        {/* Barre de progression discrète — jamais "Étape X / Y" */}
        {etape !== "termine" && (
          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 99, marginBottom: 28, overflow: "hidden" }}>
            <div style={{
              height: "100%", background: "linear-gradient(90deg,#4F46E5,#7C3AED)", borderRadius: 99, transition: "width 0.3s ease",
              width: etape === "objectif" ? "8%" : !etapesParcours ? "50%" : `${8 + (etapesParcours.indexOf(etape) + 1) * (84 / etapesParcours.length)}%`,
            }} />
          </div>
        )}

        <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: "white" }}>
          {etape === "objectif" && (
            <EcranQuestion
              titre="Qu'est-ce que vous cherchez principalement à accomplir ?"
              sousTitre="Quelques questions suffisent pour vous orienter vers le système le plus adapté à votre projet."
              enfants={
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                  {OBJECTIFS_DIAGNOSTIC.map((o) => (
                    <div key={o.id} onClick={() => { setObjectif(o); setEtape(o.parcours === "bientot" ? "bientot" : ETAPES_PAR_PARCOURS[o.parcours][0]); }} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{o.icone}</span> {o.label}
                    </div>
                  ))}
                </div>
              }
            />
          )}

          {etape === "boutique" && (
            <EcranQuestion titre="Avez-vous déjà une boutique ?" onRetour={() => setEtape("objectif")}
              peutContinuer={!!reponses.avezBoutique}
              onContinuer={() => suivant(reponses.avezBoutique === "Oui" ? "typeBoutique" : "ca")}
              enfants={<ChoixCartes options={["Oui", "Non", "Je suis en train de la créer"]} valeur={reponses.avezBoutique} onChoisir={(v) => maj("avezBoutique", v)} />}
            />
          )}

          {etape === "typeBoutique" && (
            <EcranQuestion titre="Quel type de boutique utilisez-vous ?" onRetour={() => setEtape("boutique")}
              peutContinuer={!!reponses.typeBoutique} onContinuer={() => suivant("urlBoutique")}
              enfants={<ChoixCartes options={OPTIONS_TYPE_BOUTIQUE} valeur={reponses.typeBoutique} onChoisir={(v) => maj("typeBoutique", v)} />}
            />
          )}

          {etape === "urlBoutique" && (
            <EcranQuestion titre="Pouvez-vous nous partager l'adresse de votre boutique ?" sousTitre="Facultatif." onRetour={() => setEtape("typeBoutique")}
              peutContinuer={true} onContinuer={() => suivant("ca")}
              enfants={<input placeholder="https://..." value={reponses.urlBoutique || ""} onChange={(e) => maj("urlBoutique", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "ca" && (
            <EcranQuestion titre="Quel est votre chiffre d'affaires mensuel approximatif ?" onRetour={() => setEtape(reponses.avezBoutique === "Oui" ? "urlBoutique" : "boutique")}
              peutContinuer={!!reponses.caMensuel} onContinuer={() => suivant("budgetPub")}
              enfants={<ChoixCartes options={OPTIONS_TRANCHE_CA} valeur={reponses.caMensuel} onChoisir={(v) => maj("caMensuel", v)} />}
            />
          )}

          {etape === "budgetPub" && (
            <EcranQuestion titre="Combien investissez-vous actuellement en publicité, par mois ?" onRetour={() => setEtape("ca")}
              peutContinuer={!!reponses.budgetPub} onContinuer={() => suivant("canaux")}
              enfants={<ChoixCartes options={OPTIONS_TRANCHE_CA} valeur={reponses.budgetPub} onChoisir={(v) => maj("budgetPub", v)} />}
            />
          )}

          {etape === "canaux" && (
            <EcranQuestion titre="Quels canaux utilisez-vous ?" sousTitre="Plusieurs choix possibles." onRetour={() => setEtape("budgetPub")}
              peutContinuer={(reponses.canaux || []).length > 0} onContinuer={() => suivant("probleme")}
              enfants={<ChoixCartes options={OPTIONS_CANAUX} valeur={reponses.canaux} multi onChoisir={toggleCanal} />}
            />
          )}

          {etape === "probleme" && (
            <EcranQuestion titre="Quel est votre principal problème aujourd'hui ?" onRetour={() => setEtape("canaux")}
              peutContinuer={!!reponses.problemePrincipal} onContinuer={() => suivant("commandes")}
              enfants={<ChoixCartes options={OPTIONS_PROBLEME} valeur={reponses.problemePrincipal} onChoisir={(v) => maj("problemePrincipal", v)} />}
            />
          )}

          {etape === "commandes" && (
            <EcranQuestion titre="Combien de commandes réalisez-vous environ par mois ?" onRetour={() => setEtape("probleme")}
              peutContinuer={true} onContinuer={() => suivant("objectifRevenu")}
              enfants={<input placeholder="Ex : 40" value={reponses.commandesMois || ""} onChange={(e) => maj("commandesMois", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "objectifRevenu" && (
            <EcranQuestion titre="Combien souhaitez-vous générer mensuellement ?" onRetour={() => setEtape("commandes")}
              peutContinuer={true} onContinuer={() => suivant("analyse")}
              enfants={<input placeholder="Ex : 2 000 000 FCFA" value={reponses.objectifRevenu || ""} onChange={(e) => maj("objectifRevenu", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "typeOffre" && (
            <EcranQuestion titre="Que vendez-vous ?" onRetour={() => setEtape("objectif")}
              peutContinuer={!!reponses.typeOffre} onContinuer={() => suivant("prixMoyen")}
              enfants={<ChoixCartes options={OPTIONS_TYPE_OFFRE_COACH} valeur={reponses.typeOffre} onChoisir={(v) => maj("typeOffre", v)} />}
            />
          )}

          {etape === "prixMoyen" && (
            <EcranQuestion titre="Quel est votre prix moyen ?" onRetour={() => setEtape("typeOffre")}
              peutContinuer={true} onContinuer={() => suivant("canalAcquisition")}
              enfants={<input placeholder="Ex : 75 000 FCFA" value={reponses.prixMoyen || ""} onChange={(e) => maj("prixMoyen", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "canalAcquisition" && (
            <EcranQuestion titre="Comment trouvez-vous actuellement vos clients ?" onRetour={() => setEtape("prixMoyen")}
              peutContinuer={!!reponses.canalAcquisition} onContinuer={() => suivant("avezTunnel")}
              enfants={<ChoixCartes options={OPTIONS_CANAL_COACH} valeur={reponses.canalAcquisition} onChoisir={(v) => maj("canalAcquisition", v)} />}
            />
          )}

          {etape === "avezTunnel" && (
            <EcranQuestion titre="Avez-vous déjà un tunnel de vente ?" onRetour={() => setEtape("canalAcquisition")}
              peutContinuer={!!reponses.avezTunnel} onContinuer={() => suivant("prospectsMois")}
              enfants={<ChoixCartes options={["Oui", "Non"]} valeur={reponses.avezTunnel} onChoisir={(v) => maj("avezTunnel", v)} />}
            />
          )}

          {etape === "prospectsMois" && (
            <EcranQuestion titre="Combien de prospects obtenez-vous environ par mois ?" onRetour={() => setEtape("avezTunnel")}
              peutContinuer={true} onContinuer={() => suivant("ventesMois")}
              enfants={<input placeholder="Ex : 25" value={reponses.prospectsMois || ""} onChange={(e) => maj("prospectsMois", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "ventesMois" && (
            <EcranQuestion titre="Et combien de ventes réalisez-vous, sur ces prospects ?" onRetour={() => setEtape("prospectsMois")}
              peutContinuer={true} onContinuer={() => suivant("problemeCoach")}
              enfants={<input placeholder="Ex : 4" value={reponses.ventesMois || ""} onChange={(e) => maj("ventesMois", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "problemeCoach" && (
            <EcranQuestion titre="Quel est votre principal problème aujourd'hui ?" onRetour={() => setEtape("ventesMois")}
              peutContinuer={!!reponses.problemeCoach} onContinuer={() => suivant("analyse")}
              enfants={<ChoixCartes options={OPTIONS_PROBLEME_COACH} valeur={reponses.problemeCoach} onChoisir={(v) => maj("problemeCoach", v)} />}
            />
          )}

          {etape === "orgDescription" && (
            <EcranQuestion titre="Présentez brièvement votre organisation." onRetour={() => setEtape("objectif")}
              peutContinuer={true} onContinuer={() => suivant("problemeEntreprise")}
              enfants={<textarea placeholder="Secteur, taille, activité..." value={reponses.orgDescription || ""} onChange={(e) => maj("orgDescription", e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
            />
          )}

          {etape === "problemeEntreprise" && (
            <EcranQuestion titre="Quel problème cherchez-vous à résoudre ?" onRetour={() => setEtape("orgDescription")}
              peutContinuer={true} onContinuer={() => suivant("personnesConcernees")}
              enfants={<textarea placeholder="Décrivez le problème..." value={reponses.problemeEntreprise || ""} onChange={(e) => maj("problemeEntreprise", e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
            />
          )}

          {etape === "personnesConcernees" && (
            <EcranQuestion titre="Combien de personnes sont concernées ?" onRetour={() => setEtape("problemeEntreprise")}
              peutContinuer={true} onContinuer={() => suivant("utilisateursEstimes")}
              enfants={<input placeholder="Ex : 15" value={reponses.personnesConcernees || ""} onChange={(e) => maj("personnesConcernees", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "utilisateursEstimes" && (
            <EcranQuestion titre="Combien d'utilisateurs estimez-vous ?" onRetour={() => setEtape("personnesConcernees")}
              peutContinuer={true} onContinuer={() => suivant("hasSysteme")}
              enfants={<input placeholder="Ex : 200" value={reponses.utilisateursEstimes || ""} onChange={(e) => maj("utilisateursEstimes", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "hasSysteme" && (
            <EcranQuestion titre="Disposez-vous déjà d'un système ?" onRetour={() => setEtape("utilisateursEstimes")}
              peutContinuer={!!reponses.hasSysteme} onContinuer={() => suivant("ameliorer")}
              enfants={<ChoixCartes options={OPTIONS_A_DEJA_SYSTEME} valeur={reponses.hasSysteme} onChoisir={(v) => maj("hasSysteme", v)} />}
            />
          )}

          {etape === "ameliorer" && (
            <EcranQuestion titre="Que souhaitez-vous améliorer ?" sousTitre="Plusieurs choix possibles." onRetour={() => setEtape("hasSysteme")}
              peutContinuer={(reponses.ameliorer || []).length > 0} onContinuer={() => suivant("niveauProjet")}
              enfants={<ChoixCartes options={OPTIONS_AMELIORER_ENTREPRISE} valeur={reponses.ameliorer} multi onChoisir={toggleAmeliorer} />}
            />
          )}

          {etape === "niveauProjet" && (
            <EcranQuestion titre="Quel est le niveau du projet ?" onRetour={() => setEtape("ameliorer")}
              peutContinuer={!!reponses.niveauProjet} onContinuer={() => suivant("budgetEntreprise")}
              enfants={<ChoixCartes options={OPTIONS_NIVEAU_PROJET} valeur={reponses.niveauProjet} onChoisir={(v) => maj("niveauProjet", v)} />}
            />
          )}

          {etape === "budgetEntreprise" && (
            <EcranQuestion titre="Quel budget avez-vous prévu ?" onRetour={() => setEtape("niveauProjet")}
              peutContinuer={!!reponses.budgetEntreprise} onContinuer={() => suivant("demarrage")}
              enfants={<ChoixCartes options={OPTIONS_BUDGET_ENTREPRISE} valeur={reponses.budgetEntreprise} onChoisir={(v) => maj("budgetEntreprise", v)} />}
            />
          )}

          {etape === "demarrage" && (
            <EcranQuestion titre="Quand souhaitez-vous démarrer ?" onRetour={() => setEtape("budgetEntreprise")}
              peutContinuer={!!reponses.demarrage} onContinuer={() => suivant("analyse")}
              enfants={<ChoixCartes options={OPTIONS_DEMARRAGE} valeur={reponses.demarrage} onChoisir={(v) => maj("demarrage", v)} />}
            />
          )}

          {etape === "analyse" && (
            <div style={{ textAlign: "center", padding: "50px 0" }}>
              <div style={{ fontSize: 30, marginBottom: 16 }}>⏳</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Nous commençons à comprendre votre projet.</div>
            </div>
          )}

          {etape === "resume" && diagnostic && (
            <div style={{ animation: "rvDiagFade 0.4s ease both" }}>
              <div style={{ fontSize: "clamp(19px,3vw,24px)", fontWeight: 800, marginBottom: 20 }}>Voici ce que nous avons compris.</div>
              {[
                ["Votre situation", diagnostic.situationTexte],
                ["Votre objectif", diagnostic.objectifTexte],
                ["Votre principal défi", diagnostic.defiTexte],
              ].map(([label, texte]) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, color: "#A78BFA", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>D'après vos réponses, {texte.charAt(0).toLowerCase() + texte.slice(1)}</div>
                </div>
              ))}
              <div style={{ background: "#12121C", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 12, padding: 16, marginTop: 20 }}>
                <div style={{ fontSize: 10.5, color: "#A78BFA", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>CE QUE NOUS RECOMMANDONS</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Priorité : {diagnostic.levierPrincipal}</div>
                {diagnostic.recommandations.map((r) => (
                  <div key={r} style={{ fontSize: 13, color: "white", padding: "4px 0" }}>✓ {r}</div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <button onClick={() => setEtape(etapesParcours[etapesParcours.length - 5] /* dernière question avant "analyse" */)} style={btnFantome}>← Revenir</button>
                <button onClick={() => setEtape("capture")} style={btnPrimaire}>Recevoir ma recommandation</button>
              </div>
            </div>
          )}

          {etape === "bientot" && (
            <div style={{ animation: "rvDiagFade 0.4s ease both" }}>
              <div style={{ fontSize: "clamp(19px,3vw,24px)", fontWeight: 800, marginBottom: 10 }}>Bien noté.</div>
              <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", marginBottom: 20, lineHeight: 1.6 }}>
                Le parcours détaillé pour "{objectif?.label}" arrive bientôt. En attendant, décrivez-nous votre projet en quelques mots — on vous répond directement.
              </div>
              <textarea placeholder="Décrivez votre projet..." value={besoinLibre} onChange={(e) => setBesoinLibre(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
                <button onClick={() => setEtape("objectif")} style={btnFantome}>← Revenir</button>
                <button onClick={() => setEtape("capture")} style={btnPrimaire}>Continuer</button>
              </div>
            </div>
          )}

          {etape === "capture" && (
            <div style={{ animation: "rvDiagFade 0.4s ease both" }}>
              <div style={{ fontSize: "clamp(19px,3vw,24px)", fontWeight: 800, marginBottom: 6 }}>Où pouvons-nous vous envoyer votre recommandation ?</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>Nous avons suffisamment d'informations pour comprendre votre projet.</div>
              <input placeholder="Nom *" value={capture.nom} onChange={(e) => setCapture({ ...capture, nom: e.target.value })} style={inputStyle} />
              <input placeholder="Entreprise" value={capture.entreprise} onChange={(e) => setCapture({ ...capture, entreprise: e.target.value })} style={inputStyle} />
              <input placeholder="WhatsApp *" value={capture.whatsapp} onChange={(e) => setCapture({ ...capture, whatsapp: e.target.value })} style={inputStyle} />
              <input placeholder="Email" value={capture.email} onChange={(e) => setCapture({ ...capture, email: e.target.value })} style={inputStyle} />
              <input placeholder="Pays" value={capture.pays} onChange={(e) => setCapture({ ...capture, pays: e.target.value })} style={inputStyle} />
              {/* Honeypot anti-spam : invisible pour un humain, souvent rempli par un bot */}
              <input value={siteWebPiege} onChange={(e) => setSiteWebPiege(e.target.value)} tabIndex={-1} autoComplete="off"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
              {erreur && <div style={{ color: "#F87171", fontSize: 12, marginBottom: 10 }}>{erreur}</div>}
              <button onClick={soumettre} disabled={envoiEnCours} style={{ ...btnPrimaire, width: "100%", opacity: envoiEnCours ? 0.7 : 1 }}>
                {envoiEnCours ? "Envoi..." : "Recevoir ma recommandation"}
              </button>
            </div>
          )}

          {etape === "termine" && (
            <div style={{ textAlign: "center", animation: "rvDiagFade 0.4s ease both" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: "clamp(19px,3vw,24px)", fontWeight: 800, marginBottom: 10 }}>Merci {capture.nom.split(" ")[0]} !</div>
              <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", marginBottom: 26, lineHeight: 1.6 }}>
                Votre projet est enregistré. Un expert revient vers vous sous 24h, généralement bien plus vite.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a href={`https://wa.me/${cleanPhoneForWhatsApp(NUMERO_WHATSAPP_DIAGNOSTIC)}?text=${encodeURIComponent(messageWhatsApp)}`} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimaire, textDecoration: "none", textAlign: "center" }}>
                  💬 Continuer sur WhatsApp
                </a>
                <button onClick={onFermer} style={btnFantome}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
