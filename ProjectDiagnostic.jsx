import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  OBJECTIFS_DIAGNOSTIC, OPTIONS_TRANCHE_CA, OPTIONS_TYPE_BOUTIQUE, OPTIONS_CANAUX, OPTIONS_PROBLEME,
  OPTIONS_TYPE_OFFRE_COACH, OPTIONS_CANAL_COACH, OPTIONS_PROBLEME_COACH,
  OPTIONS_A_DEJA_SYSTEME, OPTIONS_AMELIORER_ENTREPRISE, OPTIONS_NIVEAU_PROJET, OPTIONS_BUDGET_ENTREPRISE, OPTIONS_DEMARRAGE,
  OPTIONS_TYPE_PRODUIT_STARTUP, OPTIONS_STADE_STARTUP, OPTIONS_MODELE_ECONOMIQUE,
  OPTIONS_SERVICES_AGENCE, OPTIONS_DELAI_AGENCE, OPTIONS_MODELE_COLLABORATION,
  OPTIONS_TAILLE_ORG, OPTIONS_OUI_NON,
  diagnostiquerEcommerce, diagnostiquerCoach, diagnostiquerEntreprise, diagnostiquerStartup, diagnostiquerAgence, diagnostiquerStrategique, diagnostiquerLibre,
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
  startup: ["typeProduitStartup", "stadeStartup", "equipeTechnique", "utilisateursCibles", "modeleEconomique", "budgetStartup", "lancementStartup", "analyse", "resume", "capture", "termine"],
  agence: ["nombreClients", "typeClients", "servicesAgence", "volumeMensuel", "whiteLabel", "delaiAgence", "modeleCollaboration", "analyse", "resume", "capture", "termine"],
  strategique: ["organisation", "fonction", "secteur", "tailleOrganisation", "problemeStrategique", "objectifStrategique", "nombreUtilisateurs", "nombreSites", "besoinsFonctionnels", "integrations", "securite", "budgetStrategique", "delaiStrategique", "cahierDesCharges", "accompagnementStrategique", "analyse", "resume", "capture", "termine"],
  libre: ["blocagePrincipal", "analyse", "resume", "capture", "termine"],
};

const cardStyle = { background: "#12121C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "white", textAlign: "left", transition: "border-color 0.2s ease, transform 0.15s ease" };
const inputStyle = { width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#0A0A12", color: "white", fontSize: 16, marginBottom: 10, boxSizing: "border-box" };
const btnPrimaire = { background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "white", border: "none", borderRadius: 10, padding: "13px 24px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" };
const btnFantome = { background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 12.5, cursor: "pointer", padding: "8px 4px" };

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

  // Identifiant de session côté client uniquement (jamais envoyé nulle part d'autre), pour
  // pouvoir compter des SESSIONS uniques dans le funnel (§31), pas juste des clics.
  const sessionIdRef = useRef((typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  // Best-effort, ne bloque jamais et ne casse jamais le tunnel si l'analytics échoue.
  function logEvent(type, extra = {}) {
    supabase.rpc("enregistrer_evenement_diagnostic", {
      p_session_id: sessionIdRef.current,
      p_event_type: type,
      p_objective: extra.objective || objectif?.label || null,
      p_etape: extra.etape || null,
    }).catch(() => {});
  }

  useEffect(() => { logEvent("diagnostic_started"); }, []);

  const estEcommerce = objectif?.parcours === "ecommerce";
  const estCoach = objectif?.parcours === "coach";
  const estEntreprise = objectif?.parcours === "entreprise";
  const estStartup = objectif?.parcours === "startup";
  const estAgence = objectif?.parcours === "agence";
  const estStrategique = objectif?.parcours === "strategique";
  const estLibre = objectif?.parcours === "libre";
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

  function toggleServiceAgence(service) {
    setReponses((r) => {
      const actuels = r.servicesAgence || [];
      const nouveaux = actuels.includes(service) ? actuels.filter((s) => s !== service) : [...actuels, service];
      return { ...r, servicesAgence: nouveaux };
    });
  }

  function suivant(prochaine) {
    const etapeActuelle = etape;
    const estPremiereEtape = etapesParcours && etapesParcours[0] === etapeActuelle;
    logEvent(estPremiereEtape ? "profile_selected" : "question_answered", { etape: etapeActuelle });
    if (prochaine === "analyse") {
      const d = estCoach ? diagnostiquerCoach(reponses) : estEntreprise ? diagnostiquerEntreprise(reponses) : estStartup ? diagnostiquerStartup(reponses) : estAgence ? diagnostiquerAgence(reponses) : estStrategique ? diagnostiquerStrategique(reponses) : estLibre ? diagnostiquerLibre(reponses) : diagnostiquerEcommerce(reponses);
      setDiagnostic(d);
      logEvent("diagnostic_completed");
      setEtape("analyse");
      setTimeout(() => { setEtape("resume"); logEvent("recommendation_viewed"); }, 1100); // court temps de "traitement", pas un vrai calcul long
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
      p_business_stage: reponses.avezBoutique || reponses.hasSysteme || reponses.stadeStartup || null,
      p_platform: reponses.typeBoutique || reponses.typeProduitStartup || null,
      p_store_url: reponses.urlBoutique || null,
      p_revenue_range: reponses.caMensuel || null,
      p_ad_spend_range: reponses.budgetPub || reponses.budgetEntreprise || reponses.budgetStartup || reponses.budgetStrategique || null,
      p_ad_channels: (reponses.canaux || []).join(", ") || reponses.canalAcquisition || null,
      p_pain_point: reponses.problemePrincipal || reponses.problemeCoach || reponses.problemeEntreprise || reponses.problemeStrategique || reponses.blocagePrincipal || besoinLibre || null,
      p_monthly_orders: reponses.commandesMois || reponses.ventesMois || null,
      p_desired_revenue: reponses.objectifRevenu || null,
      p_offer_type: reponses.typeOffre || null,
      p_average_price: reponses.prixMoyen || null,
      p_has_funnel: reponses.avezTunnel || null,
      p_monthly_leads: reponses.prospectsMois || null,
      p_org_description: reponses.orgDescription || reponses.organisation || null,
      p_people_affected: reponses.personnesConcernees || null,
      p_estimated_users: reponses.utilisateursEstimes || reponses.nombreUtilisateurs || null,
      p_improve_areas: (reponses.ameliorer || []).join(", ") || null,
      p_project_level: reponses.niveauProjet || null,
      p_start_timing: reponses.demarrage || reponses.lancementStartup || reponses.delaiStrategique || null,
      p_team_status: reponses.equipeTechnique || null,
      p_target_users: reponses.utilisateursCibles || null,
      p_business_model: reponses.modeleEconomique || null,
      p_client_count: reponses.nombreClients || null,
      p_client_type: reponses.typeClients || null,
      p_monthly_volume: reponses.volumeMensuel || null,
      p_white_label: reponses.whiteLabel || null,
      p_services_needed: (reponses.servicesAgence || []).join(", ") || null,
      p_delivery_timeframe: reponses.delaiAgence || null,
      p_collaboration_model: reponses.modeleCollaboration || null,
      p_contact_role: reponses.fonction || null,
      p_sector: reponses.secteur || null,
      p_org_size: reponses.tailleOrganisation || null,
      p_project_objective: reponses.objectifStrategique || null,
      p_site_count: reponses.nombreSites || null,
      p_functional_needs: reponses.besoinsFonctionnels || null,
      p_integrations_needed: reponses.integrations || null,
      p_security_requirements: reponses.securite || null,
      p_has_specifications: reponses.cahierDesCharges || null,
      p_needs_strategic_support: reponses.accompagnementStrategique || null,
      p_lead_type: estAgence ? "partner" : estStrategique ? "strategic" : "diagnostic",
      p_force_strategic: estStrategique,
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
    logEvent("lead_created");
    setEtape("termine");
  }

  const messageWhatsApp = objectif
    ? `Bonjour, je viens de terminer le diagnostic RecuVente. Mon projet concerne : ${objectif.label}.`
    : "Bonjour, je souhaite discuter d'un projet avec vous.";

  // §32 : si la personne ferme avant "termine", on note juste où elle s'est arrêtée (anonyme,
  // même table analytics que le reste) — jamais de données personnelles tapées mais non
  // envoyées. Pas de case de consentement sur ce formulaire aujourd'hui, donc pas de base
  // légitime pour exploiter un abandon avec des coordonnées.
  function fermerAvecSuivi() {
    if (etape !== "termine" && etape !== "objectif") {
      logEvent("diagnostic_abandoned", { etape });
    }
    onFermer();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,6,10,0.92)", backdropFilter: "blur(6px)", overflowY: "auto", display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <style>{`@keyframes rvDiagFade { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }`}</style>
      <div style={{ maxWidth: 560, width: "100%", height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button onClick={fermerAvecSuivi} style={{ ...btnFantome, fontSize: 22, padding: "10px 12px" }}>✕</button>
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
                    <div key={o.id} onClick={() => { logEvent("objective_selected", { objective: o.label }); setObjectif(o); setEtape(o.parcours === "bientot" ? "bientot" : ETAPES_PAR_PARCOURS[o.parcours][0]); }} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}>
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

          {etape === "typeProduitStartup" && (
            <EcranQuestion titre="Quel produit voulez-vous construire ?" onRetour={() => setEtape("objectif")}
              peutContinuer={!!reponses.typeProduitStartup} onContinuer={() => suivant("stadeStartup")}
              enfants={<ChoixCartes options={OPTIONS_TYPE_PRODUIT_STARTUP} valeur={reponses.typeProduitStartup} onChoisir={(v) => maj("typeProduitStartup", v)} />}
            />
          )}

          {etape === "stadeStartup" && (
            <EcranQuestion titre="Où en êtes-vous ?" onRetour={() => setEtape("typeProduitStartup")}
              peutContinuer={!!reponses.stadeStartup} onContinuer={() => suivant("equipeTechnique")}
              enfants={<ChoixCartes options={OPTIONS_STADE_STARTUP} valeur={reponses.stadeStartup} onChoisir={(v) => maj("stadeStartup", v)} />}
            />
          )}

          {etape === "equipeTechnique" && (
            <EcranQuestion titre="Avez-vous déjà une équipe technique ?" onRetour={() => setEtape("stadeStartup")}
              peutContinuer={!!reponses.equipeTechnique} onContinuer={() => suivant("utilisateursCibles")}
              enfants={<ChoixCartes options={["Oui", "Non"]} valeur={reponses.equipeTechnique} onChoisir={(v) => maj("equipeTechnique", v)} />}
            />
          )}

          {etape === "utilisateursCibles" && (
            <EcranQuestion titre="Combien d'utilisateurs ciblez-vous ?" onRetour={() => setEtape("equipeTechnique")}
              peutContinuer={true} onContinuer={() => suivant("modeleEconomique")}
              enfants={<input placeholder="Ex : 5000" value={reponses.utilisateursCibles || ""} onChange={(e) => maj("utilisateursCibles", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "modeleEconomique" && (
            <EcranQuestion titre="Quel est votre modèle économique ?" onRetour={() => setEtape("utilisateursCibles")}
              peutContinuer={!!reponses.modeleEconomique} onContinuer={() => suivant("budgetStartup")}
              enfants={<ChoixCartes options={OPTIONS_MODELE_ECONOMIQUE} valeur={reponses.modeleEconomique} onChoisir={(v) => maj("modeleEconomique", v)} />}
            />
          )}

          {etape === "budgetStartup" && (
            <EcranQuestion titre="Quel est votre budget ?" onRetour={() => setEtape("modeleEconomique")}
              peutContinuer={!!reponses.budgetStartup} onContinuer={() => suivant("lancementStartup")}
              enfants={<ChoixCartes options={OPTIONS_BUDGET_ENTREPRISE} valeur={reponses.budgetStartup} onChoisir={(v) => maj("budgetStartup", v)} />}
            />
          )}

          {etape === "lancementStartup" && (
            <EcranQuestion titre="Quand voulez-vous lancer ?" onRetour={() => setEtape("budgetStartup")}
              peutContinuer={!!reponses.lancementStartup} onContinuer={() => suivant("analyse")}
              enfants={<ChoixCartes options={OPTIONS_DEMARRAGE} valeur={reponses.lancementStartup} onChoisir={(v) => maj("lancementStartup", v)} />}
            />
          )}

          {etape === "nombreClients" && (
            <EcranQuestion titre="Combien de clients gérez-vous actuellement ?" onRetour={() => setEtape("objectif")}
              peutContinuer={true} onContinuer={() => suivant("typeClients")}
              enfants={<input placeholder="Ex : 12" value={reponses.nombreClients || ""} onChange={(e) => maj("nombreClients", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "typeClients" && (
            <EcranQuestion titre="Quel type de clients accompagnez-vous ?" onRetour={() => setEtape("nombreClients")}
              peutContinuer={true} onContinuer={() => suivant("servicesAgence")}
              enfants={<input placeholder="Ex : e-commerçants, coachs, PME..." value={reponses.typeClients || ""} onChange={(e) => maj("typeClients", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "servicesAgence" && (
            <EcranQuestion titre="Quels services recherchez-vous chez un partenaire technique ?" sousTitre="Plusieurs choix possibles." onRetour={() => setEtape("typeClients")}
              peutContinuer={(reponses.servicesAgence || []).length > 0} onContinuer={() => suivant("volumeMensuel")}
              enfants={<ChoixCartes options={OPTIONS_SERVICES_AGENCE} valeur={reponses.servicesAgence} multi onChoisir={toggleServiceAgence} />}
            />
          )}

          {etape === "volumeMensuel" && (
            <EcranQuestion titre="Quel volume mensuel de projets estimez-vous ?" onRetour={() => setEtape("servicesAgence")}
              peutContinuer={true} onContinuer={() => suivant("whiteLabel")}
              enfants={<input placeholder="Ex : 6" value={reponses.volumeMensuel || ""} onChange={(e) => maj("volumeMensuel", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "whiteLabel" && (
            <EcranQuestion titre="Recherchez-vous un travail en marque blanche ?" onRetour={() => setEtape("volumeMensuel")}
              peutContinuer={!!reponses.whiteLabel} onContinuer={() => suivant("delaiAgence")}
              enfants={<ChoixCartes options={["Oui", "Non"]} valeur={reponses.whiteLabel} onChoisir={(v) => maj("whiteLabel", v)} />}
            />
          )}

          {etape === "delaiAgence" && (
            <EcranQuestion titre="Quel délai moyen recherchez-vous ?" onRetour={() => setEtape("whiteLabel")}
              peutContinuer={!!reponses.delaiAgence} onContinuer={() => suivant("modeleCollaboration")}
              enfants={<ChoixCartes options={OPTIONS_DELAI_AGENCE} valeur={reponses.delaiAgence} onChoisir={(v) => maj("delaiAgence", v)} />}
            />
          )}

          {etape === "modeleCollaboration" && (
            <EcranQuestion titre="Quel modèle de collaboration envisagez-vous ?" onRetour={() => setEtape("delaiAgence")}
              peutContinuer={!!reponses.modeleCollaboration} onContinuer={() => suivant("analyse")}
              enfants={<ChoixCartes options={OPTIONS_MODELE_COLLABORATION} valeur={reponses.modeleCollaboration} onChoisir={(v) => maj("modeleCollaboration", v)} />}
            />
          )}

          {etape === "organisation" && (
            <EcranQuestion titre="Quelle est votre organisation ?" onRetour={() => setEtape("objectif")}
              peutContinuer={true} onContinuer={() => suivant("fonction")}
              enfants={<input placeholder="Nom de l'organisation" value={reponses.organisation || ""} onChange={(e) => maj("organisation", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "fonction" && (
            <EcranQuestion titre="Quelle est votre fonction ?" onRetour={() => setEtape("organisation")}
              peutContinuer={true} onContinuer={() => suivant("secteur")}
              enfants={<input placeholder="Ex : Directeur général, DSI..." value={reponses.fonction || ""} onChange={(e) => maj("fonction", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "secteur" && (
            <EcranQuestion titre="Dans quel secteur opérez-vous ?" onRetour={() => setEtape("fonction")}
              peutContinuer={true} onContinuer={() => suivant("tailleOrganisation")}
              enfants={<input placeholder="Ex : Banque, santé, distribution..." value={reponses.secteur || ""} onChange={(e) => maj("secteur", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "tailleOrganisation" && (
            <EcranQuestion titre="Quelle est la taille de votre organisation ?" onRetour={() => setEtape("secteur")}
              peutContinuer={!!reponses.tailleOrganisation} onContinuer={() => suivant("problemeStrategique")}
              enfants={<ChoixCartes options={OPTIONS_TAILLE_ORG} valeur={reponses.tailleOrganisation} onChoisir={(v) => maj("tailleOrganisation", v)} />}
            />
          )}

          {etape === "problemeStrategique" && (
            <EcranQuestion titre="Quel problème cherchez-vous à résoudre ?" onRetour={() => setEtape("tailleOrganisation")}
              peutContinuer={true} onContinuer={() => suivant("objectifStrategique")}
              enfants={<textarea placeholder="Décrivez le problème..." value={reponses.problemeStrategique || ""} onChange={(e) => maj("problemeStrategique", e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
            />
          )}

          {etape === "objectifStrategique" && (
            <EcranQuestion titre="Quel est votre objectif ?" onRetour={() => setEtape("problemeStrategique")}
              peutContinuer={true} onContinuer={() => suivant("nombreUtilisateurs")}
              enfants={<textarea placeholder="Décrivez l'objectif visé..." value={reponses.objectifStrategique || ""} onChange={(e) => maj("objectifStrategique", e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
            />
          )}

          {etape === "nombreUtilisateurs" && (
            <EcranQuestion titre="Combien d'utilisateurs estimez-vous ?" onRetour={() => setEtape("objectifStrategique")}
              peutContinuer={true} onContinuer={() => suivant("nombreSites")}
              enfants={<input placeholder="Ex : 500" value={reponses.nombreUtilisateurs || ""} onChange={(e) => maj("nombreUtilisateurs", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "nombreSites" && (
            <EcranQuestion titre="Combien de sites ou agences sont concernés ?" sousTitre="Si pertinent pour votre organisation." onRetour={() => setEtape("nombreUtilisateurs")}
              peutContinuer={true} onContinuer={() => suivant("besoinsFonctionnels")}
              enfants={<input placeholder="Ex : 8" value={reponses.nombreSites || ""} onChange={(e) => maj("nombreSites", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "besoinsFonctionnels" && (
            <EcranQuestion titre="Quels sont vos besoins fonctionnels ?" onRetour={() => setEtape("nombreSites")}
              peutContinuer={true} onContinuer={() => suivant("integrations")}
              enfants={<textarea placeholder="Fonctionnalités attendues..." value={reponses.besoinsFonctionnels || ""} onChange={(e) => maj("besoinsFonctionnels", e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
            />
          )}

          {etape === "integrations" && (
            <EcranQuestion titre="Des intégrations sont-elles nécessaires ?" sousTitre="Ex : ERP, paiement mobile, outils existants..." onRetour={() => setEtape("besoinsFonctionnels")}
              peutContinuer={true} onContinuer={() => suivant("securite")}
              enfants={<input placeholder="Décrivez les intégrations..." value={reponses.integrations || ""} onChange={(e) => maj("integrations", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "securite" && (
            <EcranQuestion titre="Avez-vous des exigences de sécurité particulières ?" onRetour={() => setEtape("integrations")}
              peutContinuer={true} onContinuer={() => suivant("budgetStrategique")}
              enfants={<input placeholder="Ex : hébergement local, conformité..." value={reponses.securite || ""} onChange={(e) => maj("securite", e.target.value)} style={inputStyle} />}
            />
          )}

          {etape === "budgetStrategique" && (
            <EcranQuestion titre="Quel budget avez-vous prévu ?" onRetour={() => setEtape("securite")}
              peutContinuer={!!reponses.budgetStrategique} onContinuer={() => suivant("delaiStrategique")}
              enfants={<ChoixCartes options={OPTIONS_BUDGET_ENTREPRISE} valeur={reponses.budgetStrategique} onChoisir={(v) => maj("budgetStrategique", v)} />}
            />
          )}

          {etape === "delaiStrategique" && (
            <EcranQuestion titre="Quel est le délai souhaité ?" onRetour={() => setEtape("budgetStrategique")}
              peutContinuer={!!reponses.delaiStrategique} onContinuer={() => suivant("cahierDesCharges")}
              enfants={<ChoixCartes options={OPTIONS_DEMARRAGE} valeur={reponses.delaiStrategique} onChoisir={(v) => maj("delaiStrategique", v)} />}
            />
          )}

          {etape === "cahierDesCharges" && (
            <EcranQuestion titre="Disposez-vous déjà d'un cahier des charges ?" onRetour={() => setEtape("delaiStrategique")}
              peutContinuer={!!reponses.cahierDesCharges} onContinuer={() => suivant("accompagnementStrategique")}
              enfants={<ChoixCartes options={OPTIONS_OUI_NON} valeur={reponses.cahierDesCharges} onChoisir={(v) => maj("cahierDesCharges", v)} />}
            />
          )}

          {etape === "accompagnementStrategique" && (
            <EcranQuestion titre="Avez-vous besoin d'un accompagnement stratégique ?" onRetour={() => setEtape("cahierDesCharges")}
              peutContinuer={!!reponses.accompagnementStrategique} onContinuer={() => suivant("analyse")}
              enfants={<ChoixCartes options={OPTIONS_OUI_NON} valeur={reponses.accompagnementStrategique} onChoisir={(v) => maj("accompagnementStrategique", v)} />}
            />
          )}

          {etape === "blocagePrincipal" && (
            <EcranQuestion titre="Pas de problème. Décrivons simplement votre situation." sousTitre="Qu'est-ce qui vous empêche aujourd'hui de développer votre activité comme vous le souhaitez ?" onRetour={() => setEtape("objectif")}
              peutContinuer={(reponses.blocagePrincipal || "").trim().length > 0} onContinuer={() => suivant("analyse")}
              enfants={<textarea placeholder="Écrivez librement, en quelques phrases..." value={reponses.blocagePrincipal || ""} onChange={(e) => maj("blocagePrincipal", e.target.value)} rows={5} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />}
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
                <a href={`https://wa.me/${cleanPhoneForWhatsApp(NUMERO_WHATSAPP_DIAGNOSTIC)}?text=${encodeURIComponent(messageWhatsApp)}`} target="_blank" rel="noopener noreferrer" onClick={() => logEvent("whatsapp_clicked")} style={{ ...btnPrimaire, textDecoration: "none", textAlign: "center" }}>
                  💬 Continuer sur WhatsApp
                </a>
                <button onClick={fermerAvecSuivi} style={btnFantome}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
