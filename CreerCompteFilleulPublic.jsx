import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Page publique où un partenaire fraîchement activé crée son vrai compte de
// connexion — le chaînon qui manquait entre "activé côté admin" et "peut se
// connecter à RecuVenteMR". Accessible via un lien à usage unique généré par
// l'admin, jamais devinable.
export default function CreerCompteFilleulPublic({ token }) {
  const [verification, setVerification] = useState(undefined);
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    supabase.rpc("verifier_token_activation_compte", { p_token: token }).then(({ data }) => {
      setVerification(data || { valide: false, raison: "Lien invalide." });
      if (data?.email) setEmail(data.email);
    });
  }, [token]);

  async function creerCompte(evt) {
    evt.preventDefault();
    setErreur("");
    if (!email.trim() || !motDePasse) return setErreur("Email et mot de passe obligatoires.");
    if (motDePasse.length < 6) return setErreur("Le mot de passe doit faire au moins 6 caractères.");
    if (motDePasse !== confirmation) return setErreur("Les deux mots de passe ne correspondent pas.");

    setEnCours(true);
    try {
      const reponse = await fetch("/api/admin-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer_compte_filleul", token, email: email.trim(), password: motDePasse }),
      });
      const json = await reponse.json();
      if (!reponse.ok) { setErreur(json?.error || "Échec de la création du compte."); setEnCours(false); return; }
      setSucces(true);
    } catch (e) {
      setErreur("Erreur réseau, réessaie.");
    }
    setEnCours(false);
  }

  const style = { background: "#0d2417", minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const carte = { background: "white", borderRadius: 18, padding: 32, width: "100%", maxWidth: 400 };
  const champ = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 12 };

  if (verification === undefined) {
    return <div style={style}><div style={{ color: "#8fa69b" }}>Vérification du lien…</div></div>;
  }

  if (!verification.valide) {
    return (
      <div style={style}>
        <div style={{ ...carte, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Lien indisponible</div>
          <div style={{ color: "#6B7168", fontSize: 13.5 }}>{verification.raison}</div>
        </div>
      </div>
    );
  }

  if (succes) {
    return (
      <div style={style}>
        <div style={{ ...carte, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Compte créé !</div>
          <p style={{ color: "#6B7168", fontSize: 13.5, marginBottom: 20 }}>Bienvenue {verification.nom}. Vous pouvez maintenant vous connecter à RecuVenteMR avec votre email et votre mot de passe.</p>
          <a href="/" style={{ display: "block", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Me connecter →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={style}>
      <div style={carte}>
        <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase" }}>RecuVenteMR</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4, marginBottom: 4 }}>Bienvenue {verification.nom} 👋</div>
        <p style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>Dernière étape : créez votre mot de passe pour accéder à votre boutique, votre réseau et votre formation.</p>
        <form onSubmit={creerCompte}>
          <input type="email" placeholder="Votre email" value={email} onChange={(e) => setEmail(e.target.value)} style={champ} required />
          <input type="password" placeholder="Choisissez un mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} style={champ} required />
          <input type="password" placeholder="Confirmez le mot de passe" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} style={champ} required />
          {erreur && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreur}</div>}
          <button type="submit" disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            {enCours ? "Création..." : "Créer mon compte →"}
          </button>
        </form>
      </div>
    </div>
  );
}
