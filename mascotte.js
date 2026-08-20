// La mascotte de connexion.html / inscription.html : un petit personnage a
// lunettes de soleil, boule a facettes tournante au-dessus de la tete,
// lumieres qui tournent autour. Source unique pour ne pas dupliquer ce SVG
// (~40 lignes) dans les deux pages ; injecte par auth.js dans
// [data-mascot] si l'element existe sur la page.

export const MASCOTTE_SVG = `<svg viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ballShine" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
      <stop offset="45%" stop-color="#d8d8de" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#8d8d97" stop-opacity="0.3" />
    </radialGradient>
    <linearGradient id="bodyShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2733" />
      <stop offset="100%" stop-color="#181620" />
    </linearGradient>
  </defs>
  <g class="au-mascot-lights">
    <circle cx="80" cy="12" r="3" fill="#ff6363" />
    <circle cx="106" cy="24" r="2.4" fill="#9281f7" />
    <circle cx="112" cy="46" r="2" fill="#ffe27a" />
    <circle cx="48" cy="46" r="2" fill="#63a1ff" />
    <circle cx="54" cy="24" r="2.4" fill="#ff6363" />
  </g>
  <g class="au-mascot-ball">
    <circle cx="80" cy="38" r="17" fill="url(#ballShine)" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" />
    <g stroke="rgba(10,8,16,0.35)" stroke-width="0.6" fill="none">
      <path d="M63 38h34M80 21v34M67 25l26 26M93 25 67 51" />
      <circle cx="80" cy="38" r="10" />
    </g>
  </g>
  <line x1="80" y1="55" x2="80" y2="76" stroke="rgba(255,255,255,0.25)" stroke-width="1.4" />
  <g class="au-mascot-body">
    <ellipse cx="80" cy="140" rx="46" ry="50" fill="url(#bodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <circle cx="38" cy="128" r="9" fill="url(#bodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <circle cx="122" cy="128" r="9" fill="url(#bodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <g>
      <rect x="46" y="124" width="30" height="22" rx="11" fill="#0a0810" stroke="#ff6363" stroke-width="2" />
      <rect x="84" y="124" width="30" height="22" rx="11" fill="#0a0810" stroke="#ff6363" stroke-width="2" />
      <path d="M76 133h8" stroke="#ff6363" stroke-width="2" stroke-linecap="round" />
      <path d="M52 130q6-4 12 0" stroke="rgba(255,255,255,0.45)" stroke-width="1.6" fill="none" stroke-linecap="round" />
      <path d="M90 130q6-4 12 0" stroke="rgba(255,255,255,0.45)" stroke-width="1.6" fill="none" stroke-linecap="round" />
    </g>
    <path d="M68 160q12 10 24 0" stroke="#e8e9eb" stroke-width="2.6" fill="none" stroke-linecap="round" />
    <path d="M36 158q-14 6-16 20" stroke="url(#bodyShade)" stroke-width="10" fill="none" stroke-linecap="round" />
    <path d="M124 158q14 6 16 20" stroke="url(#bodyShade)" stroke-width="10" fill="none" stroke-linecap="round" />
  </g>
</svg>`;

export function injecterMascotte() {
  const conteneur = document.querySelector("[data-mascot]");
  if (conteneur) conteneur.innerHTML = MASCOTTE_SVG;
}
