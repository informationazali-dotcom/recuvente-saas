import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SuiviPublic from "./SuiviPublic.jsx";

const suiviId = new URLSearchParams(window.location.search).get("suivi");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {suiviId ? <SuiviPublic commandeId={suiviId} /> : <App />}
  </React.StrictMode>
);
