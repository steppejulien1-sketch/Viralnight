/* Les deux mecanismes de l'habillage repris du simulateur : l'horloge de la
   barre du haut et l'ouverture du menu lateral sur petit ecran.
   Volontairement separe de app.js, qui s'occupe des donnees : si Supabase
   tombe, la page reste manipulable. */

const horloge = document.getElementById("tbClock");
const burger = document.getElementById("tbBurger");
const voile = document.getElementById("sideScrim");

if (horloge) {
  const tic = () => {
    horloge.textContent = new Date().toLocaleTimeString("fr-BE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  tic();
  setInterval(tic, 1000);
}

if (burger && voile) {
  const basculer = (ouvert) => {
    document.body.classList.toggle("side-open", ouvert);
    burger.setAttribute("aria-expanded", String(ouvert));
    voile.setAttribute("aria-hidden", String(!ouvert));
  };

  burger.addEventListener("click", () => {
    basculer(!document.body.classList.contains("side-open"));
  });
  voile.addEventListener("click", () => basculer(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") basculer(false);
  });
  // Choisir une vue referme le menu : sur telephone il recouvre l'ecran.
  document.querySelectorAll(".side a").forEach((a) => {
    a.addEventListener("click", () => basculer(false));
  });
}
