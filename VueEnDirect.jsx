// ============================================================================
//  VUE EN DIRECT — le globe de RecuVente.
//
//  Une Terre en points lumineux, éclairée par le VRAI soleil de l'instant (jour / nuit),
//  sur laquelle s'allument en direct :
//    • les visiteurs de la boutique (points verts qui respirent, par pays) ;
//    • les commandes du jour (points dorés, par ville de livraison) ;
//    • chaque NOUVELLE commande : un faisceau de lumière jaillit de la ville, des ondes
//      se propagent, et un arc doré relie la boutique au client.
//  « Rejouer la journée » repasse toutes les commandes du jour en accéléré.
//
//  Aucune bibliothèque 3D : un seul <canvas> 2D, léger et fluide sur téléphone.
//  Aucune nouvelle fonction serveur : on relit les mêmes données que le tableau de bord.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// --- Terres émergées : grille de 0,5° (720 × 360), compressée ligne par ligne -------------
// (source : Natural Earth 1:50m, domaine public — une ligne = des longueurs alternées mer/terre)
const TERRES_RLE = "~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~3x1Pb1n22~6C|~3bAxO~6w|~32N78222V~6x|~2RU5~1i3158~6d|~2M45M5~1E~211a5c1O364~2H|~2Ia4G4~1F~1W623782524s2p9~2G|~2A26h262o7~1E~1762991t711a7~12c~2F|~2A25j1ud~1t13V431232h~1B1th~2A|~2p5f41f2ke~1zYh3135~2eb2411~2s|~2d3c8436C6~1F~0Z21ie1~2e429~2q|~2a7aa3655113o6~1F31Y2231835~2ta~2r|~26217f2225751541fd~1E~17965~2z3~2q|~1X771d2r24jc21~1H~137a2~2k2a8~2p|~1Ua31928151414614111ng~1A32~163~1A6~12c27~2d|~1R72218547412164b9273l~1A21~2zfP44t11O1~1k|~1V1222b485b21214699G~1i~2vfPKH13a14~18|~21n2365362qG~1g13~2nbE1bQLf48X|~289r53pJ~1d~2r8QQQ311f4Y|~1Na14J3~1b~1714~2p7UL42J191~1g|~1Ohi4783a554425I~19~2p7MS3644d3w4~1c|~1Nlc77748562hG~15~2r7q2j~1f9bp4~1b|~1Ml1523256c27562a18E~1015~2p7q75141212~1zo7~19|~1Lc2k167a23881d17D~14~2p7q941372~1ykk~0Z|~1M93t96338w21y~14~2o8p9241~1I71823lY|4~bx1|Ef~17te87FsW35p1~101321116L7kc2i1~2sD11|AwA2kva98i1k11q~12~1m13iU3eb3~2ME|yKfc31348w6228d7324kp61V~1lsS87b2~2O44642d6|xP5y5i195829117851212iq24R~1i12Cp3la593~344h1|2~6lDw2823d48522~2Y2j|5~6gIb4a62A352~3i|8~6aP737M361~3i|a~67R626M4~3q|a25~5YC111e732J215~3r|11h~5VF84531Q4~3u|12f~5Vk5jc~4v|177~5Yi8ib~4w|96ca1~2n298prnxkOl6l352~4v1|C~2m3a836grmBeOn5o3~4y3|j1i~2i6634ggqmA218Rm4~532|j3912~2la2c2c724sk~1Am5~552|u~2ng3f16832sh~1zn6~571|t~2lj2513a86wg~1xo7~4B1o8|s~2lr13cd1ve~1xp8~4q272lb|t~2jweId~1xp8~4m735hf|uq263~1GxhH316~1yp8~4l913jg|e1b22p2911111~1Cyg91D4~1l1cr21396~44ea61j|r1413i34h21~1syg83~2esi~45d5x|Ag51o~1rxh84~2ea1fa~3S511277a6y|B13cv~1ruk47~2d83da11~3Pz622v|J632u~1quv~1N133j56ba22~3Mz7A|I542w~1qvu~1L13313ra41613~3Lxcy|H443y2111~1k22su~1K128n23932533~3Izcy|F5I~1vou~1N7l5498~3Nzey|D4L21~1tg34v~1N5m547a~3Mzgx|A5Q21~1uc15x~1K126k43213d~3KBdA|y2W21~1A9B~1F427k512h~3I31zd81r|u3~0Z13~1A5I~1A61215j341933~3J41zdA|~1B~1y6I~1x946j4234~3V4251paD|p2~1523~1z6J~1v866f11~4a1541q8E|n1~192311~1y4K~1v73aa~4n23p8E|~1y14~1x114K~1v74b6~4p14p5t1d|b1~1n15~1w6K~1t74c6~4uq4H|61~1z~1x3J~1v46c5~4r14q3I|~1G~2g32~1Fb2~4t23q2J|~1G12~2b42~1Fa2~4u34n1M|~1G~2c52~1E4a~4u34n1M|~1I41~1R549421~1M~4w34~1a|~1K41~1O242389~1G~4A34~1a|~1M31~1K28aa~1B32~4B32~1c|~1N22~1I19bb~1A~4F41~1d|~1N~1L1aad~1A~4D51~1d|~1N~1Vj122~1D~4z62~1c|~1O~1U1162d1~1E~1g2p5~2L73~1b|~1O~1Z23~1T~12375m8~2K81f1X|~1O~24~1U~10645m9~2Jo1Y|~1O~1T17~1Ws2x671l8~2L92b1~11|~1O~1Q36~1Ys5t835j8~2La381~13|~1O~1M63~22k175sjh7~2Lb541~15|~1N~1L82~1Q1cj474qmg7~2Jc8~17|~1N~1K~1Zp42875nof8~2Gca~17|~1N~1K~1Zoc1367lqd9~2z31d8~1a|~1N~1J~20pa2469ird9~2wj142~1b|~1N~1K~1Zob2677h97be812~2sk2~1g|~1O~1H~21me1785m2c7gb~2rm1~1f|~1N~1G~23ke4883911143F7~2tl3~1f|~1N~1D~26jg3a41226124M5~2c3dn4~1e|~1O~1C~26i52a3b276411L8~284516p4~1e|~1O~1B~26jh2d2757K8~275174p4~1e|~1P~1z~27jw1876I9~24f6n4~1f|~1Q~1v12~28hv381163K9~26d7m3~1g|~1R~1u11~1B1xhq6c47I9~2731a6k4~1g|~1R~1v~2afl274c38L7~2d86h6~1g|~1S~1u~2f99h71e2a~3197e9~1g|~1S~1u~2g1ckC2434~2Jc6d9~1h|~1T~1u~2f19oN~2Jd6a129~1h|~1U~1r~2h71qp5d34~2He57g~1h|~1V~1q~2gyI25~2Hd47a12~1m|~1X~1l~2jxP~2Jm416~1p|~1Z~1i~2iBN~2Kk13421~1q|~21~1f~2hEL~2Mb15512~1v|~21~1d~2iKe4o~2Mj3~1y|~22~1b~2iO98l~2Oh3~1z|~22~1a~2jO9aj~2Pg3~1z|~2342~12~2jS6g452~2Qi1~1A|~2433~11~2jV3~3h~1T|~2433M69~2j~4f~1T|~2533K8225~2i~1S5~2j~1S|~2641z8211c4~2h~1T5~2j~1S|~2732xp5~211d~1V5~2h~1T|~2823ur5~231414~1s1u5~2h~1T|~2744rt4~2b~1v4r6~2e~1U|~2753qu5~29~1x3s7~2b~1V|~2943pu531~25~1x4s752~22~1W|~2b24ov451~21~1A4rc11~21~1X|~2c23pv3~27~1A5q12912~20~1X|~2c25mx2~26~1C4t827b2~1H51~1S|~2c35lC2~21~1C4t64l~1F52~1S|~2d35kD1~20~1E4s29k~1E53~1S|~2f25j~2D~1F6Ei~1C53~1T|~2g16iv1~27~1F6Fj~1y73~1T|~2ohr9~22~1H6Fk~1v82~1U|~2ohq238~1Z~1I5GiI1Ie1~1U|~2pgt155~1X~1K4Fk51w114G~2b|~2pgf7g551~1O~1K4Em41tav42~2f|K2~1Dhd7i6~1T~1K4Dn14sbt52~2f|~2phd6k6~1S~1K5Atsdr71~2f|M2~1Bic6k177~1J~1K6ztrfp64~2e|M2~1Cia7c1g7~1I~1K7ytphp54~2f|~2si5118u8~1G~1K7wwnjo54~2f|~2tvk349212411~1z~1L6uxmln61m4~1R|~2xrl1~1Y~1M6rzlmos4~1R|~2yq~2j~1N7pAjopr4~1R|~2Ao~2j~1N7mDjoqq4~1R|~2D71cR1~1s~1O6kGho43lo4~1S|~2G25j~2b~1O114kGfs14mn3~1T|~2Oj~29~1Q5iJcznm3~1T|~2PjH1~1p~1T4eMcAmm4~1S|~2Qi~28~1T3cPcznm311~1Q|~2Te~2a~1T29Scznn11311~1N|~2Wb~29~1V16Vco1b32hm232~1O|~2Z8~29~1W13h1Gbo1b32hm241~1O|~307n1~1M~1Wk1Gap1b35en13212~1L|~316m2~1N~1Uf1N9p1b36cq151~1L|~325j425~1I~1U87N9B27cq232~1L|~325gf215321~1v~1T3cN8B289m24321~1M|~325g71c1521~1v~27O7C2a5o1631111~1K|~33113e82j~1x~26O621A2b3o17211~1N|~36444491l~1w~24Q522z393o19141~1K|~378132v~1x~24Q432y4z1d4~1J|~3863C~1v~22S234x5J7~1J|~3b33D~1u~22X5y3H9~1J|~3c15D~1u~20Y5z2x19135~1J|~3jD~1v~1Y~0Z4z4u2d311~1J|~3jE~1wr3~1r~103A5t3c3~1L|~3jM~1pm8~1q~1E5r5~1Z|~3jO~1oic~1o~1v565p7~1Y|~3jP~1p4o~1n~1x556m8~1Z|~3jQ~1R15~1g~1y546l9g1~1I|~3jR~1V11~1e~1A54591a8~21|~3jR~1Y~1c~1C535j9~21|~3iS~1Y~1b~1A2253441bd~20|~3hU~1W~1b~1G714eek1~1F|~3gW~1V~19~1J723931ej1~1G|~3gW~1V~17~1I137229j516153~1E|~3eY~1V~16~1K128ci4962~1F|~3eW11~1P15~15~1P8bhc171~1G|~2R1lW15~1R~15~1R7bh41e251~1A|~2R1l~1212~1O~14~1S7cg4143817531~1q|~3c~19~1L~14~1P138be5215f7~1t|~3c~1119~1J~13~1U8218d56511181352132~1l|~3c~1b~1K~11~1W8127d55m447d1~14|~3d~1g12~1C~0Z~1V12b114d56d1653bh111V|~3e~1k~1BX~1Z9b316441372254lh1U|~3c~1n~1BW~208h462138121821l~19|~3c~1o~1BU~227r223okd111S|~3b~1q~1BT~245r22111ric2T|~3c~1t~1xS~264r241tha251O|~3c~1u~1wS~271t1t16i3662N|~3c~1u~1xR~2a5n1r27j3291N|~3e~1s~1xS~2882321F18ig111K|~3f~1s~1xR~2afz1dhk1J|~3f~1s~1xR~2ddn191dd15~13|~3g~1q~1yR~2ia11323135p32754j121F|~3g~1q~1yR~2t61744r664o1C|~3h~1o~1zR~2A184u485k1E|~3h~1n~1AS~2y363J511i2C|~3i~1m~1BR~2A162M4X|~3i~1k~1DS~2F1~1P|~3j~1i~1ES~2V111j2~1c|~3j~1i~1ES~2U133g2y1D|~3k~1h~1ESh1~2Dc94~1b|~3l~1f~1ETh2~2Bca4~1b|~3l~1d~1FUg3~2Ada4~1b|g1~34~1d~1FUf4~2zea4~1b|~3m~1c~1EVf5~2r34db6~19|~3m~1c~1EWd6~2p81cc7~18|~3n~1b~1EVd7~2onb8G1q|~3p~19~1EVb9~2op98~17|~3r~17~1DV9b~2ns88H1o1|01~3s~15~1DUab~2l11v49~143|~3v~13~1DSbb~2lz3a~16|~3w~12~1DQdb~2lM~1033|~3x~10~1FOeb~2lN~1023|~3x~10~1GMfb~2kO~15|~3x~10~1GKi9~2lP~14|~3x~0Z~1IIj9~2jT~12|~3x~0Z~1IIiah1~1XY~11|~3xY~1KHi9~2c~13v1u|~3yW~1LHhae1~1V~16v1t|~3yW~1MHga~29~17w2r|~3xW~1OGfa~28~1ax1q|~3xV~1PGg9~27~1dW|~3xP~1VGg9~27~1dW|~3xP~1VGg8~28~1eV|~3xL~1ZGg8~28~1fU|~3xK~20Fi7~28~1gT|~3xJ~21Cm4~2b~1f11R|~3wJ~23A~2C~1gS|~3wJ~23A~2C~1gS|~3wJ~23A~2B~1hS|~3wJ~23A~2C~1hR|~3wJ~24y~2D~1hR|~3vK~25x~2E~1gR|~3vJ~27v~2F~1gR|~3vI~29t~2H~1fR|~3vH~2as~2I~1fR|~3vH~2as~2I~1eS|~3uF11~2cq~2J~1eS|~3vE~2fo~2L~1dS|~3vD~2gn~2Ms4HS|~3vD~2gm~2NobDT|~3vC~2hl~2OjiAU|~3uC~2ij~2Qhl61rV|~3uB~2kg~2Rhn41sV|~3ur19~2l6~309v32rW|~3us25~2o1~365y1311pW|~3tu~6h12oJ3b|~3tv~6f32nK2b|~3sw~6llM2a|~3sx~6klN1a|~3rx~6mkN38|~3rw~6oiO4223|~3rw~6p715S83|~3rt~6w233T74|~3rn~7C66|~3rn~6D1~0Z56|~3qn~6N1R46|~3qn~6H1S1437|~3qi31~6H8L5128|~3qi~6M7K6b|~3q12g11~6J6K6c|~3p21h11~6K5K5d|~3p21g~6O2K6e|~3sg~7y7f|~3rh~7w7h|~3pi~7w8h|~3p11e~7x8i|~3of~7y9i|~3of~7z6k|~3og~7Y|~3ph~7x1o|~3ph~7W|~3nj~7W|~3nh~4o1~3z|~3n21d~4p3~3x|~3ng~7Z|~3pc~81|~3oc~82|~3och121~7H|~3och5~7G|~3qbh2~7I|~3pc~81|~3q11414~81|~3r525~7Z|~3ubW2~6Z|~3vdV1~6Y|~3y6~7Y|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~3U1~7H|~3Q1~7L|~3W212~7B|~3T4~7F|~3N12512~7E|~3K7~7L|~3K4~5f1~2y|~3J5~5f1n2~29|~3H8~3Cc~1i18a97w822~1q|~3B135~3HdV13H2bda5pG1x|~3A215~3B13l21L~1X~19|~3A133~3z61Gn~27~15|~3E4~3tTh~2e~13|~3w177~372cXh~2uO|~3u46811~3449Yf~2EG|~3n2462d~2v1ya2Y9~2NE|~3n1752c~2215192584151826~1da~2RC|~3l5652c11~1I451bw476~1l5~2U1bp|~3rb1d~1A1232b6~2c6~39m|~2z12132Ff2c~1A~2z6~3ej|~2wdJ93d~1x12~2y4~3fk|~2u1f16222q2455e~1v~2C2~3hl|~1H3G13z9463113o~1q~5Wo|~1I53521w~1m~1i18~5R11s|~1y171522451213342i~1j~1i1631~5Pu|~1qI25l~1e~1q~5Qy|~1i~1f2~1c~1s~5Qz|~16~2D~1g~65y|~10~2D~1f~6bz|X15~2h59~1g~6fz|I972132~2g~1n~6m64n|H~2LO5l~6q54n|J~2z44d1zbg~6zp|x4b~2m38e6yef~6t41q|w8d~2k28a512yfi~6hD|A5k~2n935492igl~6eD|X~2pj626ckp~69F|~10~2r24a416bar~6lD|w4b~2VN~6xC|P~2YE~6Cz|Q~2Yei3~6I12u|f1h2f~309~7fq|ge339~365~7nl|n~b5a|815f2~b43|kp~aT|I2~aS|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC|~bC";
const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
let masqueTerres = null;
function terres() {
  if (masqueTerres) return masqueTerres;
  const m = new Uint8Array(720 * 360);
  TERRES_RLE.split("|").forEach((ligne, j) => {
    let i = 0, x = 0, terre = 0;
    while (i < ligne.length) {
      let n;
      if (ligne[i] === "~") { n = ALPHA.indexOf(ligne[i + 1]) * 62 + ALPHA.indexOf(ligne[i + 2]); i += 3; } else { n = ALPHA.indexOf(ligne[i]); i += 1; }
      if (terre) m.fill(1, j * 720 + x, j * 720 + x + n);
      x += n; terre ^= 1;
    }
  });
  masqueTerres = m;
  return m;
}
function estTerre(lat, lon) {
  if (lat < -78) return true; // intérieur de l'Antarctique
  const j = Math.min(359, Math.max(0, Math.floor((90 - lat) * 2)));
  const i = ((Math.floor((lon + 180) * 2) % 720) + 720) % 720;
  return terres()[j * 720 + i] === 1;
}

// --- Géographie : pays (code ISO → centre) et villes (livraison) ----------------------------
const PAYS = {
  SN: [14.5, -14.5], CI: [7.5, -5.5], ML: [17.5, -4], BF: [12.3, -1.6], GN: [10.4, -10.9], GW: [12, -15], GM: [13.45, -15.4], MR: [20.3, -10.4], NE: [17.6, 8.1], TG: [8.6, 0.8], BJ: [9.3, 2.3], GH: [7.9, -1.0], NG: [9.1, 8.7], LR: [6.4, -9.4], SL: [8.5, -11.8], CV: [15.1, -23.6],
  CM: [5.7, 12.4], GA: [-0.8, 11.6], CG: [-0.7, 15.2], CD: [-2.9, 23.7], CF: [6.6, 20.9], TD: [15.4, 18.7], GQ: [1.6, 10.3], AO: [-12.3, 17.5], RW: [-2, 29.9], BI: [-3.4, 29.9], KE: [0.2, 37.9], TZ: [-6.4, 34.9], UG: [1.4, 32.3], ET: [9.1, 40.5], SO: [5.2, 46.2], DJ: [11.8, 42.6], SD: [15.5, 30.2], SS: [7.9, 30.2], ER: [15.2, 39.8],
  MA: [31.8, -7.1], DZ: [28, 2.6], TN: [34, 9.5], LY: [26.3, 17.2], EG: [26.8, 30.8], ZA: [-30.6, 22.9], NA: [-22.9, 18.5], BW: [-22.3, 24.7], ZW: [-19, 29.2], ZM: [-13.1, 27.8], MZ: [-18.7, 35.5], MW: [-13.3, 34.3], MG: [-18.8, 46.9], MU: [-20.3, 57.6], KM: [-11.9, 43.9], SC: [-4.7, 55.5],
  FR: [46.6, 2.4], BE: [50.6, 4.6], CH: [46.8, 8.2], LU: [49.8, 6.1], DE: [51.2, 10.4], ES: [40.2, -3.7], PT: [39.6, -8.0], IT: [42.8, 12.6], GB: [53.8, -1.9], IE: [53.2, -8.2], NL: [52.2, 5.5], AT: [47.6, 14.1], PL: [52, 19.4], SE: [62, 15], NO: [61, 9], DK: [56, 10], FI: [63, 26], GR: [39.1, 22.9], TR: [39, 35.2], RO: [45.9, 25], UA: [49, 31.4], RU: [58, 45], CZ: [49.8, 15.5], HU: [47.2, 19.5],
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-10.8, -52.9], AR: [-35.4, -65.2], CL: [-35.7, -71.5], CO: [4.6, -74.1], PE: [-9.2, -75], VE: [7.1, -66.2], HT: [19, -72.3], CU: [21.5, -79.5], DO: [18.7, -70.2], GF: [4, -53], GP: [16.2, -61.6], MQ: [14.6, -61],
  CN: [35.9, 104.2], IN: [21, 78.9], JP: [36.2, 138.3], KR: [36.5, 127.9], ID: [-2.5, 118], TH: [15.9, 100.9], VN: [15.9, 105.8], PH: [12.9, 121.8], MY: [4.2, 102], SG: [1.35, 103.8], PK: [30.4, 69.3], BD: [23.7, 90.4],
  SA: [23.9, 45.1], AE: [24, 54], QA: [25.3, 51.2], KW: [29.3, 47.5], LB: [33.9, 35.9], IL: [31.0, 34.9], JO: [31.2, 36.5], IR: [32.4, 53.7], IQ: [33.2, 43.7],
  AU: [-25.3, 133.8], NZ: [-40.9, 174.9], RE: [-21.1, 55.5], YT: [-12.8, 45.2],
};
const NOMS_PAYS = { senegal: "SN", "cote d'ivoire": "CI", "cote divoire": "CI", "ivory coast": "CI", mali: "ML", "burkina faso": "BF", guinee: "GN", guinea: "GN", togo: "TG", benin: "BJ", niger: "NE", ghana: "GH", nigeria: "NG", cameroun: "CM", cameroon: "CM", gabon: "GA", congo: "CG", rdc: "CD", "rd congo": "CD", maroc: "MA", morocco: "MA", algerie: "DZ", tunisie: "TN", mauritanie: "MR", gambie: "GM", france: "FR", belgique: "BE", suisse: "CH", canada: "CA", "etats-unis": "US", usa: "US", tchad: "TD", madagascar: "MG", rwanda: "RW", burundi: "BI", "centrafrique": "CF", "guinee-bissau": "GW", "cap-vert": "CV", djibouti: "DJ", comores: "KM", kenya: "KE" };
const VILLES = [
  // Sénégal
  ["dakar", 14.69, -17.45], ["plateau", 14.67, -17.43], ["medina", 14.68, -17.45], ["parcelles", 14.76, -17.44], ["almadies", 14.74, -17.51], ["ouakam", 14.72, -17.49], ["ngor", 14.75, -17.51], ["yoff", 14.76, -17.47], ["grand yoff", 14.73, -17.45], ["sacre coeur", 14.72, -17.46], ["mermoz", 14.71, -17.47], ["hlm", 14.71, -17.44], ["liberte", 14.72, -17.46], ["point e", 14.69, -17.46], ["fann", 14.69, -17.46], ["grand dakar", 14.71, -17.45], ["pikine", 14.75, -17.39], ["thiaroye", 14.75, -17.37], ["guediawaye", 14.78, -17.41], ["keur massar", 14.78, -17.31], ["rufisque", 14.72, -17.27], ["bargny", 14.70, -17.22], ["diamniadio", 14.72, -17.18], ["sangalkam", 14.79, -17.23], ["mbao", 14.73, -17.33], ["yeumbeul", 14.77, -17.35], ["malika", 14.79, -17.34], ["thies", 14.79, -16.93], ["mbour", 14.42, -16.96], ["saly", 14.45, -17.0], ["somone", 14.49, -17.08], ["tivaouane", 14.95, -16.82], ["touba", 14.85, -15.88], ["mbacke", 14.79, -15.91], ["diourbel", 14.66, -16.23], ["kaolack", 14.15, -16.07], ["fatick", 14.34, -16.41], ["kaffrine", 14.11, -15.55], ["saint-louis", 16.02, -16.49], ["saint louis", 16.02, -16.49], ["louga", 15.62, -16.22], ["richard toll", 16.46, -15.70], ["matam", 15.66, -13.26], ["tambacounda", 13.77, -13.67], ["kedougou", 12.56, -12.18], ["kolda", 12.89, -14.94], ["sedhiou", 12.71, -15.56], ["ziguinchor", 12.56, -16.27], ["cap skirring", 12.39, -16.75], ["joal", 14.17, -16.83], ["popenguine", 14.55, -17.11],
  // Côte d'Ivoire
  ["abidjan", 5.35, -4.0], ["cocody", 5.36, -3.97], ["yopougon", 5.34, -4.09], ["abobo", 5.42, -4.02], ["adjame", 5.36, -4.02], ["marcory", 5.30, -3.98], ["koumassi", 5.29, -3.95], ["treichville", 5.30, -4.01], ["port-bouet", 5.25, -3.93], ["plateau abidjan", 5.32, -4.02], ["bingerville", 5.36, -3.89], ["anyama", 5.49, -4.05], ["songon", 5.32, -4.26], ["grand-bassam", 5.20, -3.74], ["bouake", 7.69, -5.03], ["yamoussoukro", 6.82, -5.28], ["san-pedro", 4.75, -6.64], ["san pedro", 4.75, -6.64], ["daloa", 6.88, -6.45], ["korhogo", 9.46, -5.63], ["man", 7.41, -7.55], ["gagnoa", 6.13, -5.95], ["divo", 5.84, -5.36], ["abengourou", 6.73, -3.49], ["soubre", 5.79, -6.61], ["odienne", 9.51, -7.56], ["bondoukou", 8.04, -2.80], ["dabou", 5.32, -4.38], ["assinie", 5.13, -3.28],
  // Afrique de l'Ouest & Centrale
  ["bamako", 12.64, -8.0], ["sikasso", 11.32, -5.67], ["ouagadougou", 12.37, -1.52], ["bobo-dioulasso", 11.18, -4.29], ["conakry", 9.64, -13.58], ["lome", 6.13, 1.22], ["cotonou", 6.37, 2.39], ["porto-novo", 6.50, 2.60], ["parakou", 9.34, 2.63], ["niamey", 13.51, 2.11], ["accra", 5.60, -0.19], ["kumasi", 6.69, -1.62], ["lagos", 6.52, 3.38], ["abuja", 9.08, 7.40], ["nouakchott", 18.08, -15.98], ["banjul", 13.45, -16.58], ["serekunda", 13.44, -16.68], ["bissau", 11.86, -15.60], ["praia", 14.93, -23.51], ["freetown", 8.48, -13.23], ["monrovia", 6.30, -10.80],
  ["douala", 4.05, 9.77], ["yaounde", 3.87, 11.52], ["libreville", 0.42, 9.47], ["port-gentil", -0.72, 8.78], ["brazzaville", -4.27, 15.28], ["pointe-noire", -4.78, 11.86], ["kinshasa", -4.44, 15.27], ["lubumbashi", -11.66, 27.48], ["goma", -1.68, 29.22], ["ndjamena", 12.13, 15.06], ["bangui", 4.39, 18.56], ["malabo", 3.75, 8.78], ["kigali", -1.95, 30.06], ["bujumbura", -3.38, 29.36], ["nairobi", -1.29, 36.82], ["addis-abeba", 9.03, 38.74], ["antananarivo", -18.88, 47.51], ["moroni", -11.70, 43.26], ["djibouti", 11.59, 43.15],
  // Maghreb, Europe, Amérique
  ["casablanca", 33.57, -7.59], ["rabat", 34.02, -6.83], ["marrakech", 31.63, -8.0], ["tanger", 35.76, -5.83], ["fes", 34.03, -5.0], ["agadir", 30.43, -9.60], ["alger", 36.75, 3.06], ["oran", 35.70, -0.63], ["tunis", 36.81, 10.18], ["sfax", 34.74, 10.76], ["le caire", 30.04, 31.24],
  ["paris", 48.86, 2.35], ["lyon", 45.76, 4.84], ["marseille", 43.30, 5.37], ["lille", 50.63, 3.06], ["bordeaux", 44.84, -0.58], ["toulouse", 43.60, 1.44], ["nice", 43.70, 7.27], ["nantes", 47.22, -1.55], ["strasbourg", 48.57, 7.75], ["montpellier", 43.61, 3.88], ["rouen", 49.44, 1.10], ["le havre", 49.49, 0.11], ["bruxelles", 50.85, 4.35], ["liege", 50.63, 5.57], ["geneve", 46.20, 6.14], ["lausanne", 46.52, 6.63], ["luxembourg", 49.61, 6.13], ["madrid", 40.42, -3.70], ["barcelone", 41.39, 2.17], ["rome", 41.90, 12.50], ["milan", 45.46, 9.19], ["londres", 51.51, -0.13], ["berlin", 52.52, 13.40], ["montreal", 45.50, -73.57], ["quebec", 46.81, -71.21], ["new york", 40.71, -74.0], ["washington", 38.91, -77.04],
].map(([nom, lat, lon]) => [sansAccents(nom), lat, lon]).sort((a, b) => b[0].length - a[0].length); // les noms les plus longs d'abord (« grand dakar » avant « dakar »)

function sansAccents(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'");
}
function codePays(valeur) {
  const v = String(valeur || "").trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return NOMS_PAYS[sansAccents(v)] || null;
}
// Localise une commande à partir du texte de livraison (« Dakar, Parcelles U17 », « Cocody Riviera »…).
function localiserCommande(zone, paysBoutique) {
  const z = " " + sansAccents(zone).replace(/[^a-z0-9' -]/g, " ") + " ";
  for (const [nom, lat, lon] of VILLES) {
    if (z.includes(" " + nom + " ") || z.includes(" " + nom.replace(/-/g, " ") + " ")) return { lat, lon, ville: nom, exacte: true };
  }
  const c = PAYS[paysBoutique] || PAYS.SN;
  return { lat: c[0], lon: c[1], ville: null, exacte: false };
}
function hachage(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function drapeau(code) { return /^[A-Z]{2}$/.test(code || "") ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "🌍"; }
function nomPays(code) { try { return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) || code; } catch (_) { return code; } }
function titreVille(v) { return String(v || "").replace(/(^|[\s-])\S/g, (m) => m.toUpperCase()); }
const RAD = Math.PI / 180;

// Étapes du parcours client (façon « comportement des clients » de Shopify), avec leur lumière.
const ETAPES = {
  navigue: { rang: 0, nom: "Navigue", icone: "👀", rgb: [52, 211, 153] },
  produit: { rang: 0, nom: "Navigue", icone: "👀", rgb: [52, 211, 153] },
  panier: { rang: 1, nom: "Panier actif", icone: "🛍️", rgb: [34, 211, 238] },
  paiement: { rang: 2, nom: "Paiement en cours", icone: "💳", rgb: [192, 132, 252] },
  valide: { rang: 3, nom: "Commande validée", icone: "✅", rgb: [251, 191, 36] },
};
const COLONNES_PARCOURS = [
  { cle: "navigue", nom: "Navigue", court: "Visite", icone: "👀", couleur: "#34d399" },
  { cle: "panier", nom: "Panier actif", court: "Panier", icone: "🛍️", couleur: "#22d3ee" },
  { cle: "paiement", nom: "Paiement en cours", court: "Paiement", icone: "💳", couleur: "#c084fc" },
  { cle: "valide", nom: "Validé", court: "Validé", icone: "✅", couleur: "#fbbf24" },
];
function etapeDe(v) { return ETAPES[v && v.etape] ? v.etape : "navigue"; }

// Point sous-solaire à l'instant t (précision largement suffisante pour l'éclairage).
function soleil(t) {
  const d = new Date(t);
  const jour = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (jour + 10));
  const heures = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return { lat: decl, lon: (12 - heures) * 15 };
}
function vecteur(lat, lon) {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lon * RAD), Math.sin(lat * RAD), c * Math.cos(lon * RAD)];
}

// ============================================================================
export default function VueEnDirect({ workspace, commandes = [], devise = "", onClose, onOuvrirCommande }) {
  const canvasRef = useRef(null);
  const boiteRef = useRef(null);
  const paysBoutique = codePays(workspace?.country) || "SN";
  const accent = "#34d399";

  // --- Données -------------------------------------------------------------------------------
  const [visiteurs, setVisiteurs] = useState([]);
  const [visitesJour, setVisitesJour] = useState(null);
  const [fil, setFil] = useState([]); // flux d'activité (le plus récent en haut)
  const [heure, setHeure] = useState(() => new Date());
  const [rotationAuto, setRotationAuto] = useState(true);
  const [rejeu, setRejeu] = useState(false);
  const [survol, setSurvol] = useState(null);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 700);
  useEffect(() => { const f = () => setMobile(window.innerWidth < 700); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const geoDispo = useRef(true);
  useEffect(() => {
    let vivant = true;
    let precedents = null;
    const lire = () => {
      if (document.visibilityState === "hidden") return;
      // D'abord les visiteurs AVEC leur ville (nouvelle fonction) ; si elle n'existe pas encore
      // (migration SQL pas appliquée), on retombe sur la liste par pays, comme avant.
      const lireGeo = () => supabase.rpc("visiteurs_en_ligne_geo", { p_workspace: workspace.id }).then(({ data, error }) => {
        if (error || !Array.isArray(data)) throw error || new Error("indisponible");
        return data.map((v) => ({ pays: codePays(v.pays) || paysBoutique, page: v.page || "Accueil", depuis: v.depuis ? new Date(v.depuis).getTime() : Date.now(), cle: v.sid, ville: v.ville || null, lat: Number.isFinite(v.lat) ? v.lat : null, lon: Number.isFinite(v.lon) ? v.lon : null, etape: v.etape || "navigue", etapeDepuis: v.etape_depuis ? new Date(v.etape_depuis).getTime() : null }));
      });
      const lireSimple = () => supabase.rpc("visiteurs_en_ligne", { p_workspace: workspace.id }).then(({ data, error }) => {
        if (error || !Array.isArray(data)) return null;
        return data.map((v, i) => ({ pays: codePays(v.pays) || paysBoutique, page: v.page || "Accueil", depuis: v.depuis ? new Date(v.depuis).getTime() : Date.now(), cle: `${v.pays || ""}-${v.depuis || i}`, ville: null, lat: null, lon: null }));
      });
      (geoDispo.current ? lireGeo().catch(() => { geoDispo.current = false; return lireSimple(); }) : lireSimple()).then((liste) => {
        if (!vivant || !liste) return;
        // Nouveaux visiteurs → une ligne dans le flux d'activité.
        if (precedents) {
          const avant = new Set(precedents.map((v) => v.cle));
          liste.filter((v) => !avant.has(v.cle)).slice(0, 3).forEach((v) => ajouterFil({ type: "visiteur", texte: `${drapeau(v.pays)} Nouveau visiteur — ${v.ville ? `${v.ville}, ` : ""}${nomPays(v.pays)}`, sous: v.page }));
          // Un visiteur avance dans le parcours : panier → paiement → validé.
          const etapesAvant = new Map(precedents.map((v) => [v.cle, etapeDe(v)]));
          liste.forEach((v) => {
            const avantEtape = etapesAvant.get(v.cle); const maintenant = etapeDe(v);
            if (!avantEtape || ETAPES[maintenant].rang <= ETAPES[avantEtape].rang || ETAPES[maintenant].rang === 0) return;
            const lieu = v.ville ? `${v.ville}` : nomPays(v.pays);
            ajouterFil({ type: maintenant, texte: `${ETAPES[maintenant].icone} ${ETAPES[maintenant].nom} — ${lieu}`, sous: v.page });
            etat.current.impulsions.push({ cle: v.cle, t0: performance.now(), rgb: ETAPES[maintenant].rgb });
          });
        }
        precedents = liste;
        setVisiteurs(liste);
      }, () => {});
    };
    lire();
    const m = setInterval(lire, 10000);
    supabase.rpc("statistiques_visites", { p_workspace_id: workspace.id }).then(({ data }) => { if (vivant) setVisitesJour(data?.[0]?.aujourd_hui ?? null); }, () => {});
    const h = setInterval(() => setHeure(new Date()), 1000);
    return () => { vivant = false; clearInterval(m); clearInterval(h); };
  }, [workspace.id]);

  function ajouterFil(evt) {
    setFil((f) => [{ ...evt, id: `${Date.now()}-${Math.random()}`, t: Date.now() }, ...f].slice(0, 7));
  }

  // Commandes du jour, localisées.
  const commandesJour = useMemo(() => {
    const debut = new Date(); debut.setHours(0, 0, 0, 0);
    return (commandes || [])
      .filter((c) => c && c.created_at && new Date(c.created_at) >= debut && c.statut !== "annulee")
      .map((c) => ({ ...c, lieu: localiserCommande(c.zone, paysBoutique) }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [commandes, paysBoutique]);
  // Comportement des clients en direct : combien sont à chaque étape en ce moment.
  const parcours = useMemo(() => {
    const n = { navigue: 0, panier: 0, paiement: 0, valide: 0 };
    visiteurs.forEach((v) => { const k = etapeDe(v); n[k === "produit" ? "navigue" : k]++; });
    return n;
  }, [visiteurs]);
  const ventesJour = commandesJour.reduce((s, c) => s + (Number(c.montant) || 0), 0);
  const conversion = visitesJour ? Math.min(100, (commandesJour.length / visitesJour) * 100) : null;
  const topVilles = useMemo(() => {
    const m = new Map();
    commandesJour.forEach((c) => { const k = c.lieu.ville ? titreVille(c.lieu.ville) : "Autre"; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [commandesJour]);
  // Regroupement des visiteurs : par ville quand on la connaît, sinon par pays.
  const visiteursParPays = useMemo(() => {
    const m = new Map();
    visiteurs.forEach((v) => { const k = v.ville ? `${drapeau(v.pays)} ${v.ville}` : `${drapeau(v.pays)}`; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [visiteurs]);

  // Montant qui « compte » jusqu'à sa valeur (effet tableau de bord premium).
  const [ventesAffichees, setVentesAffichees] = useState(0);
  useEffect(() => {
    let raf; const depart = ventesAffichees; const debut = performance.now();
    const pas = (t) => { const k = Math.min(1, (t - debut) / 900); setVentesAffichees(Math.round(depart + (ventesJour - depart) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(pas); };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [ventesJour]);

  // --- État partagé avec la boucle d'animation (sans re-rendu React à 60 i/s) --------------
  const etat = useRef({ rot: 0, incl: 0, vRot: 0, cibleRot: null, cibleIncl: null, glisse: null, faisceaux: [], arcs: [], visiteurs: [], commandes: [], cibles: [], impulsions: [] });
  useEffect(() => { etat.current.visiteurs = visiteurs; }, [visiteurs]);
  useEffect(() => { etat.current.commandes = commandesJour; }, [commandesJour]);
  useEffect(() => { etat.current.rotationAuto = rotationAuto; }, [rotationAuto]);

  // Nouvelle commande pendant que le globe est ouvert → faisceau + arc + flux.
  const dejaVues = useRef(null);
  useEffect(() => {
    if (dejaVues.current === null) { dejaVues.current = new Set(commandesJour.map((c) => c.id)); return; }
    commandesJour.filter((c) => !dejaVues.current.has(c.id)).forEach((c) => {
      dejaVues.current.add(c.id);
      lancerCommande(c, true);
    });
  }, [commandesJour]);

  function lancerCommande(c, centrer) {
    const e = etat.current;
    const maison = PAYS[paysBoutique] || PAYS.SN;
    e.faisceaux.push({ lat: c.lieu.lat, lon: c.lieu.lon, t0: performance.now(), montant: c.montant, ville: c.lieu.ville });
    e.arcs.push({ de: [maison[0], maison[1]], a: [c.lieu.lat, c.lieu.lon], t0: performance.now() });
    if (e.faisceaux.length > 12) e.faisceaux.shift();
    if (e.arcs.length > 12) e.arcs.shift();
    if (centrer) { e.cibleRot = -c.lieu.lon; e.cibleIncl = Math.max(-35, Math.min(35, c.lieu.lat)); }
    ajouterFil({ type: "commande", texte: `💰 ${Number(c.montant || 0).toLocaleString("fr-FR")} ${devise}`, sous: [c.client, c.lieu.ville ? titreVille(c.lieu.ville) : null].filter(Boolean).join(" — "), commandeId: c.id });
  }

  // Rejouer la journée : toutes les commandes du jour en ~16 secondes.
  function rejouerJournee() {
    if (rejeu || commandesJour.length === 0) return;
    setRejeu(true);
    const liste = commandesJour.slice(-40);
    const pas = Math.max(350, Math.min(1400, 16000 / liste.length));
    liste.forEach((c, i) => setTimeout(() => lancerCommande(c, i % 3 === 0), i * pas));
    setTimeout(() => setRejeu(false), liste.length * pas + 1500);
  }
  function zoomer(f) { const e = etat.current; e.cibleZoom = Math.max(1, Math.min(5, (e.cibleZoom || 1) * f)); }
  function centrerBoutique() {
    const m = PAYS[paysBoutique] || PAYS.SN;
    etat.current.cibleZoom = Math.max(etat.current.cibleZoom || 1, 4);
    etat.current.cibleRot = -m[1]; etat.current.cibleIncl = Math.max(-35, Math.min(35, m[0]));
  }

  // --- Moteur de rendu --------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const boite = boiteRef.current;
    if (!canvas || !boite) return undefined;
    const ctx = canvas.getContext("2d");
    const reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const e = etat.current;
    const maison = PAYS[paysBoutique] || PAYS.SN;
    e.rot = -maison[1] + 25; e.incl = Math.max(-30, Math.min(30, maison[0]));
    e.cibleRot = -maison[1]; e.cibleIncl = e.incl;

    // Points de terre répartis uniformément (spirale de Fibonacci) → maillage régulier et élégant.
    const petit = Math.min(window.innerWidth, window.innerHeight) < 700;
    const N = petit ? 22000 : 36000;
    const pts = [];
    const or = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < N; k++) {
      const y = 1 - (2 * (k + 0.5)) / N;
      const lat = Math.asin(y) / RAD;
      const lon = ((((k * or) / RAD) % 360) + 360) % 360 - 180;
      if (estTerre(lat, lon)) pts.push({ v: vecteur(lat, lon), zone: Math.abs(lat - maison[0]) < 24 && Math.abs(((lon - maison[1] + 540) % 360) - 180) < 34 });
    }
    // Maillage FIN autour de la boutique (± 24° / 34°) : utilisé quand on zoome, pour des côtes nettes.
    const fins = [];
    const N2 = N * 9;
    for (let k = 0; k < N2; k++) {
      const y = 1 - (2 * (k + 0.5)) / N2;
      const lat = Math.asin(y) / RAD;
      if (Math.abs(lat - maison[0]) >= 24) continue;
      const lon = ((((k * or) / RAD) % 360) + 360) % 360 - 180;
      if (Math.abs(((lon - maison[1] + 540) % 360) - 180) >= 34) continue;
      if (estTerre(lat, lon)) fins.push({ v: vecteur(lat, lon) });
    }
    // Étoiles fixes (fond).
    const etoiles = Array.from({ length: 140 }, (_, i) => ({ x: hachage(`x${i}`), y: hachage(`y${i}`), r: 0.3 + hachage(`r${i}`) * 1.1, a: 0.15 + hachage(`a${i}`) * 0.55 }));

    let L = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0, R0 = 0;
    e.zoom = e.zoom || 1; e.cibleZoom = e.cibleZoom || 1;
    function taille() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      L = boite.clientWidth; H = boite.clientHeight;
      canvas.width = Math.round(L * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = L + "px"; canvas.style.height = H + "px";
      const large = L > 900;
      const etroit = L < 700;
      cx = large ? L * 0.56 : L / 2; cy = large ? H * 0.52 : etroit ? H * 0.5 : H * 0.46;
      R0 = Math.min(large ? L * 0.34 : L * 0.44, H * (large ? 0.40 : etroit ? 0.31 : 0.33));
      R = R0 * e.zoom;
    }
    taille();
    const obs = new ResizeObserver(taille); obs.observe(boite);

    // Projection : vecteur de base → écran (rotation autour de l'axe des pôles, puis inclinaison).
    function projeter(v, alt = 0) {
      const cr = Math.cos(e.rot * RAD), sr = Math.sin(e.rot * RAD);
      const ci = Math.cos(e.incl * RAD), si = Math.sin(e.incl * RAD);
      const x = v[0] * cr + v[2] * sr;
      const z0 = v[2] * cr - v[0] * sr;
      const y = v[1] * ci - z0 * si;
      const z = v[1] * si + z0 * ci;
      const k = R * (1 + alt);
      return { x: cx + x * k, y: cy - y * k, z };
    }

    let raf = 0, dernier = performance.now(), vivant = true;
    function image(t) {
      if (!vivant) return;
      raf = requestAnimationFrame(image);
      if (document.visibilityState === "hidden") return;
      const dt = Math.min(0.05, (t - dernier) / 1000); dernier = t;

      // Mouvement : glisser > inertie > recentrage doux > rotation automatique.
      if (!e.glisse) {
        if (e.cibleRot !== null) {
          let d = ((e.cibleRot - e.rot + 540) % 360) - 180;
          e.rot += d * Math.min(1, dt * 2.2);
          e.incl += (e.cibleIncl - e.incl) * Math.min(1, dt * 2.2);
          if (Math.abs(d) < 0.2 && Math.abs(e.cibleIncl - e.incl) < 0.2) { e.cibleRot = null; e.cibleIncl = null; }
        } else if (Math.abs(e.vRot) > 0.5) {
          e.rot += e.vRot * dt; e.vRot *= Math.pow(0.12, dt);
        } else if (e.rotationAuto !== false && !reduit) {
          e.rot += (4.5 / e.zoom) * dt;
        }
      }

      // Zoom doux (molette, pincement, boutons ＋ / －).
      e.zoom += (e.cibleZoom - e.zoom) * Math.min(1, dt * 5);
      R = R0 * e.zoom;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fond : nuit profonde + lueur colorée.
      const fond = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(L, H) * 0.9);
      fond.addColorStop(0, "#0b1d2a"); fond.addColorStop(0.45, "#07121c"); fond.addColorStop(1, "#03070c");
      ctx.fillStyle = fond; ctx.fillRect(0, 0, L, H);
      etoiles.forEach((s) => { ctx.globalAlpha = s.a * (0.75 + 0.25 * Math.sin(t / 900 + s.x * 20)); ctx.fillStyle = "#cfe9ff"; ctx.fillRect(s.x * L, s.y * H, s.r, s.r); });
      ctx.globalAlpha = 1;

      // Halo d'atmosphère.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.32);
      halo.addColorStop(0, "rgba(52,211,153,0.42)"); halo.addColorStop(0.35, "rgba(34,211,238,0.16)"); halo.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, Math.PI * 2); ctx.fill();
      // Océan : sphère sombre avec reflet.
      const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
      ocean.addColorStop(0, "#123447"); ocean.addColorStop(0.6, "#0a1f2e"); ocean.addColorStop(1, "#061520");
      ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Terres en points, éclairées par le soleil réel (jour lumineux, nuit bleutée).
      const sol = soleil(Date.now()); const S = vecteur(sol.lat, sol.lon);
      const fin = e.zoom > 1.8;
      const taillePt = Math.max(1.05, R0 / 230) * Math.min(1.5, Math.pow(e.zoom, fin ? 0.15 : 0.3));
      const lots = [[], [], [], [], [], []];
      const liste = fin ? pts.filter((p) => !p.zone).concat(fins) : pts;
      for (let i = 0; i < liste.length; i++) {
        const p = liste[i]; const q = projeter(p.v);
        if (q.x < -4 || q.x > L + 4 || q.y < -4 || q.y > H + 4) continue;
        if (q.z <= 0.02) continue;
        const jour = p.v[0] * S[0] + p.v[1] * S[1] + p.v[2] * S[2];
        const lum = Math.max(0, Math.min(1, (jour + 0.12) / 0.32));
        const bord = Math.pow(q.z, 0.55);
        const niveau = Math.min(5, Math.floor((0.25 + 0.75 * lum) * bord * 6));
        lots[niveau].push(q.x, q.y, lum);
      }
      const couleursJour = ["rgba(56,110,140,0.35)", "rgba(52,160,150,0.5)", "rgba(52,190,150,0.65)", "rgba(60,211,160,0.8)", "rgba(110,231,183,0.92)", "rgba(190,255,225,1)"];
      for (let n = 0; n < 6; n++) {
        const l = lots[n]; if (!l.length) continue;
        ctx.fillStyle = couleursJour[n];
        for (let j = 0; j < l.length; j += 3) ctx.fillRect(l[j] - taillePt / 2, l[j + 1] - taillePt / 2, taillePt, taillePt);
      }
      // Liseré lumineux du bord de la Terre.
      const lis = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.01);
      lis.addColorStop(0, "rgba(52,211,153,0)"); lis.addColorStop(1, "rgba(120,255,210,0.28)");
      ctx.fillStyle = lis; ctx.beginPath(); ctx.arc(cx, cy, R * 1.01, 0, Math.PI * 2); ctx.fill();

      e.cibles = [];
      // Arcs dorés boutique → client.
      e.arcs = e.arcs.filter((a) => t - a.t0 < 9000);
      e.arcs.forEach((a) => {
        const va = vecteur(a.de[0], a.de[1]), vb = vecteur(a.a[0], a.a[1]);
        const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
        const om = Math.acos(dot); if (om < 0.002) return;
        const age = (t - a.t0) / 1000; const avance = Math.min(1, age / 1.6); const fondu = age > 6 ? Math.max(0, 1 - (age - 6) / 3) : 1;
        const hauteur = Math.min(0.35, 0.08 + om * 0.35);
        ctx.lineWidth = 2; ctx.lineCap = "round";
        let prec = null;
        const seg = 48;
        for (let s = 0; s <= seg * avance; s++) {
          const u = s / seg; const s1 = Math.sin((1 - u) * om) / Math.sin(om), s2 = Math.sin(u * om) / Math.sin(om);
          const v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
          const q = projeter(v, Math.sin(Math.PI * u) * hauteur);
          if (prec && (q.z > -0.15 || prec.z > -0.15)) {
            ctx.strokeStyle = `rgba(251,191,36,${(0.25 + 0.75 * u) * fondu})`;
            ctx.beginPath(); ctx.moveTo(prec.x, prec.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
          prec = q;
        }
        if (prec && avance < 1) { ctx.fillStyle = `rgba(255,236,170,${fondu})`; ctx.beginPath(); ctx.arc(prec.x, prec.y, 3, 0, Math.PI * 2); ctx.fill(); }
      });

      // Commandes du jour : points dorés.
      (e.commandes || []).forEach((c) => {
        const q = projeter(vecteur(c.lieu.lat + (hachage(c.id) - 0.5) * 0.25, c.lieu.lon + (hachage(c.id + "x") - 0.5) * 0.25), 0.004);
        if (q.z <= 0.05) return;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 13);
        g.addColorStop(0, "rgba(255,230,150,1)"); g.addColorStop(0.3, "rgba(251,191,36,0.55)"); g.addColorStop(1, "rgba(251,191,36,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff8dd"; ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fill();
        e.cibles.push({ x: q.x, y: q.y, r: 12, type: "commande", c });
      });

      // Visiteurs en direct : points verts qui respirent.
      (e.visiteurs || []).forEach((v, i) => {
        const h1 = hachage(v.cle + "a"), h2 = hachage(v.cle + "b");
        const exact = Number.isFinite(v.lat) && Number.isFinite(v.lon);
        const base = exact ? [v.lat, v.lon] : (PAYS[v.pays] || PAYS[paysBoutique] || PAYS.SN);
        const ecart = exact ? 0.08 : 3; // plusieurs visiteurs dans la même ville : légèrement écartés
        const q = projeter(vecteur(base[0] + (h1 - 0.5) * ecart, base[1] + (h2 - 0.5) * ecart), 0.006);
        if (q.z <= 0.05) return;
        // Couleur selon l'étape : vert (visite) → cyan (panier) → violet (paiement) → or (validé).
        const et = ETAPES[etapeDe(v)]; const [cr, cg, cb] = et.rgb;
        const vite = et.rang >= 2 ? 900 : 1600; // le paiement « bat » plus vite
        const phase = (t / vite + h1) % 1;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.6 * (1 - phase)})`; ctx.lineWidth = et.rang >= 2 ? 2 : 1.4;
        ctx.beginPath(); ctx.arc(q.x, q.y, 4 + phase * (et.rang >= 2 ? 26 : 20), 0, Math.PI * 2); ctx.stroke();
        const rayon = 11 + et.rang * 2;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rayon);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.8)`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rayon, 0, Math.PI * 2); ctx.fill();
        // Impulsion lumineuse quand le visiteur vient d'avancer d'une étape.
        (e.impulsions || []).forEach((imp) => {
          if (imp.cle !== v.cle) return; const a = (t - imp.t0) / 1400; if (a > 1) return;
          ctx.strokeStyle = `rgba(${imp.rgb[0]},${imp.rgb[1]},${imp.rgb[2]},${1 - a})`; ctx.lineWidth = 3 * (1 - a) + 0.5;
          ctx.beginPath(); ctx.arc(q.x, q.y, 6 + a * 48, 0, Math.PI * 2); ctx.stroke();
        });
        e.cibles.push({ x: q.x, y: q.y, r: 10, type: "visiteur", v });
      });

      e.impulsions = (e.impulsions || []).filter((imp) => t - imp.t0 < 1500);

      // Zoom avant : les noms des villes apparaissent (visiteurs en vert, commandes en doré).
      if (e.zoom > 1.7) {
        const etiquettes = new Map();
        (e.visiteurs || []).forEach((v) => { if (v.ville && Number.isFinite(v.lat)) { const k = "v" + v.ville; const x = etiquettes.get(k) || { lat: v.lat, lon: v.lon, nom: v.ville, n: 0, couleur: "#a7f3d0" }; x.n++; etiquettes.set(k, x); } });
        (e.commandes || []).forEach((c) => { if (c.lieu.ville) { const k = "c" + c.lieu.ville; const x = etiquettes.get(k) || { lat: c.lieu.lat, lon: c.lieu.lon, nom: titreVille(c.lieu.ville), n: 0, couleur: "#fde68a", dy: 16 }; x.n++; etiquettes.set(k, x); } });
        const alpha = Math.min(1, (e.zoom - 1.7) / 0.6);
        ctx.font = "600 11.5px 'IBM Plex Sans', system-ui, sans-serif";
        const places = [];
        [...etiquettes.values()].sort((a, b) => b.n - a.n).forEach((x) => {
          const q = projeter(vecteur(x.lat, x.lon), 0.006); if (q.z <= 0.15) return;
          const txt = `${x.nom}${x.n > 1 ? " · " + x.n : ""}`;
          const w = ctx.measureText(txt).width + 10;
          // Évite les chevauchements : on essaie à droite, à gauche, au-dessus, en dessous.
          const essais = [[10, -8], [-w - 10, -8], [-w / 2, -26], [-w / 2, 12]].map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy + (x.dy || 0) * 0 }));
          const libre = essais.find((r) => !places.some((p) => r.x < p.x + p.w && r.x + w > p.x && r.y < p.y + 16 && r.y + 16 > p.y));
          if (!libre) return;
          places.push({ x: libre.x, y: libre.y, w });
          ctx.globalAlpha = alpha * Math.min(1, q.z * 1.5);
          ctx.fillStyle = "rgba(3,10,16,0.55)"; ctx.fillRect(libre.x, libre.y, w, 16);
          ctx.fillStyle = x.couleur; ctx.fillText(txt, libre.x + 5, libre.y + 12);
        });
        ctx.globalAlpha = 1;
      }

      // Faisceaux des nouvelles commandes : colonne de lumière + ondes + étiquette flottante.
      e.faisceaux = e.faisceaux.filter((f) => t - f.t0 < 5200);
      e.faisceaux.forEach((f) => {
        const age = (t - f.t0) / 1000; const v = vecteur(f.lat, f.lon);
        const bas = projeter(v, 0.003); if (bas.z <= 0) return;
        const monte = Math.min(1, age / 0.7); const fondu = age > 3.8 ? Math.max(0, 1 - (age - 3.8) / 1.4) : 1;
        // Colonne de lumière verticale à l'écran (toujours visible, même au centre du globe).
        const hauteurFx = Math.min(140, R * 0.55) * (1 - Math.pow(1 - monte, 3));
        const haut = { x: bas.x, y: bas.y - hauteurFx };
        const grad = ctx.createLinearGradient(bas.x, bas.y, haut.x, haut.y);
        grad.addColorStop(0, `rgba(255,240,190,${0.95 * fondu})`); grad.addColorStop(1, "rgba(251,191,36,0)");
        ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.globalAlpha = 0.45 * fondu;
        ctx.beginPath(); ctx.moveTo(bas.x, bas.y); ctx.lineTo(haut.x, haut.y); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bas.x, bas.y); ctx.lineTo(haut.x, haut.y); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${0.9 * fondu})`; ctx.beginPath(); ctx.moveTo(bas.x, bas.y); ctx.lineTo(haut.x, haut.y); ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const p = ((age - k * 0.45) % 1.8) / 1.8; if (age - k * 0.45 < 0) continue;
          ctx.strokeStyle = `rgba(251,191,36,${0.7 * (1 - p) * fondu})`; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.ellipse(bas.x, bas.y, 4 + p * 34, (4 + p * 34) * Math.max(0.25, bas.z), 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (age > 0.5) {
          const texte = `+ ${Number(f.montant || 0).toLocaleString("fr-FR")} ${devise}`;
          ctx.font = "700 13px 'IBM Plex Sans', system-ui, sans-serif";
          const w = ctx.measureText(texte).width + 18;
          const lx = haut.x - w / 2, ly = haut.y - 30 - Math.min(1, (age - 0.5) / 0.6) * 8;
          ctx.globalAlpha = Math.min(1, (age - 0.5) / 0.4) * fondu;
          ctx.fillStyle = "rgba(20,16,4,0.72)"; ctx.strokeStyle = "rgba(251,191,36,0.85)"; ctx.lineWidth = 1;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(lx, ly, w, 24, 12); else ctx.rect(lx, ly, w, 24); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#ffe8a3"; ctx.fillText(texte, lx + 9, ly + 16.5);
          ctx.globalAlpha = 1;
        }
      });
    }
    raf = requestAnimationFrame(image);

    // Interaction : glisser pour tourner (souris et doigt), inertie au relâchement.
    const doigts = new Map();
    let pince = null;
    const molette = (ev) => { ev.preventDefault(); e.cibleZoom = Math.max(1, Math.min(5, e.cibleZoom * Math.exp(-ev.deltaY * 0.0015))); };
    const basPince = (ev) => {
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (doigts.size === 2) { const [a, b] = [...doigts.values()]; pince = { d: Math.hypot(a.x - b.x, a.y - b.y), z: e.cibleZoom }; e.glisse = null; }
    };
    const bougePince = (ev) => {
      if (!doigts.has(ev.pointerId)) return false;
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pince && doigts.size === 2) { const [a, b] = [...doigts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); e.cibleZoom = Math.max(1, Math.min(5, pince.z * (d / Math.max(20, pince.d)))); e.zoom = e.cibleZoom; return true; }
      return false;
    };
    const hautPince = (ev) => { doigts.delete(ev.pointerId); if (doigts.size < 2) pince = null; };
    const bas = (ev) => { basPince(ev); if (doigts.size > 1) return; e.glisse = { x: ev.clientX, y: ev.clientY, rot: e.rot, incl: e.incl, t: performance.now(), dernierX: ev.clientX }; e.cibleRot = null; e.cibleIncl = null; canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId); };
    const bouge = (ev) => {
      if (bougePince(ev)) return;
      if (!e.glisse) {
        const r = canvas.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const c = e.cibles.find((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < k.r * k.r);
        setSurvol(c ? { x, y, cible: c } : null);
        canvas.style.cursor = c ? "pointer" : "grab";
        return;
      }
      const dx = ev.clientX - e.glisse.x, dy = ev.clientY - e.glisse.y;
      e.rot = e.glisse.rot + dx * (180 / Math.max(200, R * 2.2));
      e.incl = Math.max(-60, Math.min(60, e.glisse.incl + dy * (120 / Math.max(200, R * 2.2))));
      const now = performance.now();
      e.vRot = ((ev.clientX - e.glisse.dernierX) * (180 / Math.max(200, R * 2.2))) / Math.max(0.016, (now - e.glisse.t) / 1000);
      e.glisse.dernierX = ev.clientX; e.glisse.t = now;
    };
    const haut = (ev) => {
      hautPince(ev);
      if (e.glisse && Math.abs(ev.clientX - e.glisse.x) < 5 && Math.abs(ev.clientY - e.glisse.y) < 5) {
        const r = canvas.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const c = e.cibles.find((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + 6) ** 2);
        if (c && c.type === "commande" && onOuvrirCommande) onOuvrirCommande(c.c.id);
        else if (c) setSurvol({ x, y, cible: c });
        e.vRot = 0;
      }
      e.glisse = null;
    };
    canvas.addEventListener("pointerdown", bas);
    canvas.addEventListener("wheel", molette, { passive: false });
    window.addEventListener("pointercancel", hautPince);
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", haut);
    const echap = (ev) => { if (ev.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", echap);

    return () => {
      vivant = false; cancelAnimationFrame(raf); obs.disconnect();
      canvas.removeEventListener("pointerdown", bas); canvas.removeEventListener("wheel", molette); window.removeEventListener("pointercancel", hautPince); window.removeEventListener("pointermove", bouge); window.removeEventListener("pointerup", haut); window.removeEventListener("keydown", echap);
    };
  }, [paysBoutique, devise]);

  // --- Interface (verre dépoli, typographie fine, chiffres qui comptent) ----------------------
  const verre = { background: "rgba(10,24,34,0.55)", border: "1px solid rgba(160,255,220,0.14)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderRadius: 16, color: "#e8fff6", boxShadow: "0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)" };
  const bouton = { ...verre, borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
  const nbVisiteurs = visiteurs.length;
  const tuile = (label, valeur, couleur, sous) => (
    <div style={{ ...verre, padding: mobile ? "9px 10px" : "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: mobile ? 9.5 : 10.5, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 18 : 24, fontWeight: 700, color: couleur, marginTop: 3, textShadow: `0 0 18px ${couleur}66`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valeur}</div>
      {sous && <div style={{ fontSize: mobile ? 10 : 11, opacity: 0.55, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sous}</div>}
    </div>
  );
  const heureTexte = heure.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div ref={boiteRef} style={{ position: "fixed", inset: 0, zIndex: 120, background: "#03070c", overflow: "hidden", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", userSelect: "none" }}>
      <style>{`
        @keyframes rvLive { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .45; transform: scale(.8) } }
        @keyframes rvEntre { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
        .rv-vd-scroll::-webkit-scrollbar { display: none }
        @keyframes rvBat { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
        @keyframes rvFlux { from { background-position: 0 0 } to { background-position: 200px 0 } }
        .rv-flux { background: linear-gradient(90deg, rgba(52,211,153,.15), rgba(52,211,153,.9) 20%, rgba(34,211,238,.9) 45%, rgba(192,132,252,.9) 70%, rgba(251,191,36,.9) 90%, rgba(251,191,36,.15)); background-size: 200px 2px; animation: rvFlux 2.4s linear infinite; opacity: .55; filter: drop-shadow(0 0 4px rgba(110,231,183,.6)) }
      `}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }} />

      {/* En-tête */}
      <div style={{ position: "absolute", top: 14, left: 14, right: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#e8fff6" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: accent, boxShadow: `0 0 12px ${accent}`, animation: "rvLive 1.6s ease-in-out infinite" }} />
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>Vue en direct</span>
          </div>
          <div style={{ color: "rgba(232,255,246,0.55)", fontSize: 12, marginTop: 2 }}>{workspace?.name} · {heureTexte}</div>
        </div>
        <button onClick={onClose} aria-label="Fermer" style={{ ...bouton, pointerEvents: "auto", width: 38, height: 38, padding: 0, justifyContent: "center", fontSize: 18 }}>✕</button>
      </div>

      {/* Chiffres clés */}
      <div style={mobile
        ? { position: "absolute", left: 12, right: 12, top: 66, display: "grid", gridTemplateColumns: "0.85fr 1.05fr 1.3fr", gap: 6 }
        : { position: "absolute", left: 14, top: 72, width: "min(260px, calc(100% - 28px))", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {tuile("En ligne", nbVisiteurs, "#6ee7b7", nbVisiteurs > 1 ? "visiteurs" : "visiteur")}
        {tuile("Commandes", commandesJour.length, "#fcd34d", "aujourd'hui")}
        <div style={mobile ? {} : { gridColumn: "1 / -1" }}>{tuile(mobile ? "CA du jour" : "Ventes du jour", `${ventesAffichees.toLocaleString("fr-FR")}${mobile ? "" : " " + devise}`, "#fde68a", conversion !== null ? `${mobile ? devise + " · " : ""}Conv. ${conversion.toFixed(1)} %${mobile ? "" : ` · ${visitesJour} visite${visitesJour > 1 ? "s" : ""}`}` : mobile ? devise : "")}</div>
      </div>

      {/* Comportement des clients : pipeline lumineux en direct */}
      <div style={mobile
        ? { position: "absolute", left: 12, right: 12, bottom: 118, ...verre, padding: "10px 10px 8px" }
        : { position: "absolute", left: 14, top: 262, width: 260, boxSizing: "border-box", ...verre, padding: "12px 14px 10px" }}>
        <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6, fontWeight: 700, marginBottom: 8 }}>Comportement des clients · en direct</div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          <div className="rv-flux" style={{ position: "absolute", left: "12%", right: "12%", top: mobile ? 17 : 19, height: 2, borderRadius: 2 }} />
          {COLONNES_PARCOURS.map((c) => {
            const n = parcours[c.cle] || 0; const actif = n > 0;
            return (
              <div key={c.cle} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
                <div style={{ width: mobile ? 34 : 38, height: mobile ? 34 : 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: mobile ? 15 : 17,
                  background: actif ? `radial-gradient(circle at 35% 30%, ${c.couleur}55, ${c.couleur}18 70%)` : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${actif ? c.couleur : "rgba(255,255,255,0.12)"}`,
                  boxShadow: actif ? `0 0 16px ${c.couleur}88, inset 0 0 10px ${c.couleur}44` : "none",
                  animation: actif && (c.cle === "paiement" || c.cle === "valide") ? "rvBat 1.1s ease-in-out infinite" : "none",
                  transition: "all .4s ease" }}>{c.icone}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 16 : 18, fontWeight: 700, color: actif ? c.couleur : "rgba(232,255,246,0.35)", textShadow: actif ? `0 0 12px ${c.couleur}88` : "none", lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: mobile ? 9.5 : 10.5, opacity: actif ? 0.85 : 0.45, lineHeight: 1.2 }}>{mobile ? c.court : c.nom}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Flux d'activité */}
      <div className="rv-vd-scroll" style={mobile
        ? { position: "absolute", left: 12, right: 12, top: 148, display: "flex", flexDirection: "column", gap: 6 }
        : { position: "absolute", right: 14, top: 72, width: "min(290px, 44vw)", display: "flex", flexDirection: "column", gap: 6, maxHeight: "46vh", overflowY: "auto" }}>
        {fil.length === 0 && !mobile && <div style={{ ...verre, padding: "10px 12px", fontSize: 12, opacity: 0.75 }}>En attente d'activité… chaque visite et chaque commande apparaîtra ici en direct.</div>}
        {(mobile ? fil.slice(0, 1) : fil).map((f) => (
          <div key={f.id} onClick={() => f.commandeId && onOuvrirCommande && onOuvrirCommande(f.commandeId)} style={{ ...verre, padding: "9px 12px", animation: "rvEntre .35s ease", cursor: f.commandeId ? "pointer" : "default", borderColor: f.type === "commande" || f.type === "valide" ? "rgba(251,191,36,0.45)" : f.type === "paiement" ? "rgba(192,132,252,0.5)" : f.type === "panier" ? "rgba(34,211,238,0.45)" : "rgba(160,255,220,0.14)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.type === "commande" || f.type === "valide" ? "#fde68a" : f.type === "paiement" ? "#e9d5ff" : f.type === "panier" ? "#a5f3fc" : "#d1fae5" }}>{f.texte}</div>
            {f.sous && <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.sous}</div>}
          </div>
        ))}
      </div>

      {/* Bas : pays des visiteurs, villes qui commandent, commandes */}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {(visiteursParPays.length > 0 || topVilles.length > 0) && (
          <div className="rv-vd-scroll" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {visiteursParPays.slice(0, 6).map(([p, n]) => <span key={p} style={{ ...bouton, cursor: "default", flexShrink: 0, color: "#d1fae5" }}>{p} · {n}</span>)}
            {topVilles.map(([v, n]) => <span key={v} style={{ ...bouton, cursor: "default", flexShrink: 0, color: "#fde68a", borderColor: "rgba(251,191,36,0.35)" }}>📍 {v} · {n}</span>)}
          </div>
        )}
        <div className="rv-vd-scroll" style={{ display: "flex", gap: 8, flexWrap: mobile ? "nowrap" : "wrap", overflowX: "auto" }}>
          <button onClick={rejouerJournee} disabled={rejeu || commandesJour.length === 0} style={{ ...bouton, flexShrink: 0, color: "#fde68a", opacity: rejeu || commandesJour.length === 0 ? 0.5 : 1 }}>{rejeu ? "⏳ Rejeu en cours…" : "▶ Rejouer la journée"}</button>
          <button onClick={centrerBoutique} style={{ ...bouton, flexShrink: 0 }}>🎯 Ma boutique</button>
          <button onClick={() => zoomer(1.6)} aria-label="Zoom avant" style={{ ...bouton, flexShrink: 0, width: 38, justifyContent: "center", padding: "8px 0" }}>＋</button>
          <button onClick={() => zoomer(1 / 1.6)} aria-label="Zoom arrière" style={{ ...bouton, flexShrink: 0, width: 38, justifyContent: "center", padding: "8px 0" }}>－</button>
          <button onClick={() => setRotationAuto((r) => !r)} style={{ ...bouton, flexShrink: 0 }}>{rotationAuto ? "⏸ Pause" : "🔄 Rotation"}</button>
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(232,255,246,0.4)", display: mobile ? "none" : "block" }}>🟢 visite · 🔵 panier · 🟣 paiement en cours · 🟡 validé et commandes du jour (par ville) · éclairage jour / nuit réel · glisse pour tourner, pince ou molette pour zoomer (les villes s'affichent), touche un point doré pour ouvrir la commande</div>
      </div>

      {/* Bulle d'information au survol / toucher */}
      {survol && (
        <div style={{ ...verre, position: "absolute", left: Math.min(survol.x + 14, (boiteRef.current?.clientWidth || 400) - 220), top: survol.y + 14, padding: "8px 11px", fontSize: 12, pointerEvents: "none", maxWidth: 210 }}>
          {survol.cible.type === "commande" ? (
            <>
              <div style={{ fontWeight: 800, color: "#fde68a" }}>{Number(survol.cible.c.montant || 0).toLocaleString("fr-FR")} {devise}</div>
              <div style={{ opacity: 0.75 }}>{survol.cible.c.client || "Client"}{survol.cible.c.lieu.ville ? ` · ${titreVille(survol.cible.c.lieu.ville)}` : ""}</div>
              <div style={{ opacity: 0.5, marginTop: 2 }}>{new Date(survol.cible.c.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · touche pour ouvrir</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, color: "#6ee7b7" }}>{drapeau(survol.cible.v.pays)} Visiteur — {survol.cible.v.ville ? `${survol.cible.v.ville}, ` : ""}{nomPays(survol.cible.v.pays)}</div>
              <div style={{ opacity: 0.75 }}>{survol.cible.v.page}</div>
              <div style={{ marginTop: 3, fontWeight: 700, color: `rgb(${ETAPES[etapeDe(survol.cible.v)].rgb.join(",")})` }}>{ETAPES[etapeDe(survol.cible.v)].icone} {ETAPES[etapeDe(survol.cible.v)].nom}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
