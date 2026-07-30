// Generation du QR code affiche a l'entree du club.
//
// On s'appuie sur la librairie `qrcode` plutot que sur une implementation maison :
// un encodage QR errone ne se voit pas a l'oeil, il se decouvre le soir de la soiree
// quand plus personne n'arrive a scanner. Le cout d'une dependance eprouvee est
// largement inferieur a ce risque.

import QRCode from "qrcode";

/**
 * URL a encoder dans le QR code d'un etablissement.
 *
 * @param {string} baseUrl - origine du site, ex: "https://viralnight.example"
 * @param {string} publicCode - code public de l'etablissement
 */
export function buildScanUrl(baseUrl, publicCode) {
  const url = new URL("/scan.html", baseUrl);
  url.searchParams.set("c", String(publicCode).trim().toUpperCase());
  return url.toString();
}

/**
 * Genere le QR code en SVG.
 *
 * Niveau de correction Q (25 %) : le QR est imprime et colle en boite de nuit, donc
 * expose aux rayures, aux reflets et a la penombre. Un niveau plus faible economiserait
 * quelques modules au prix de la fiabilite de lecture.
 *
 * @param {string} scanUrl
 * @param {object} [options]
 * @returns {Promise<string>} balise <svg>
 */
export function renderQrSvg(scanUrl, { dark = "#08090b", light = "#ffffff", margin = 2 } = {}) {
  return QRCode.toString(scanUrl, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin,
    color: { dark, light },
  });
}

/**
 * Genere le QR code en PNG encode en data URI, pour l'impression et le telechargement.
 * @returns {Promise<string>}
 */
export function renderQrPngDataUrl(scanUrl, { width = 900 } = {}) {
  return QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
