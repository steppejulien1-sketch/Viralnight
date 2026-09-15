"""Les VRAIES icones des applis du telephone de la demo (ecran « Capture ton profil »).

Julien, 16/09/2026 : « veille a prendre les vrais icones, les vrais logos, la
c'est des copies mal faites ». Les silhouettes redessinees sont remplacees par
l'icone officielle de chaque appli, telle que l'App Store la publie
(itunes.apple.com/search, API publique d'Apple), reduite a 120 px et enregistree
dans public/ambiance/applis/.

Usage : python outils/icones_applis_demo.py
"""
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "public" / "ambiance" / "applis"
SORTIE.mkdir(parents=True, exist_ok=True)

# fichier : terme de recherche dans l'App Store
APPLIS = {
    "snapchat": "snapchat",
    "tiktok": "tiktok",
    "spotify": "spotify musique",
    "youtube": "youtube",
    "discord": "discord",
    "uber": "uber",
    "netflix": "netflix",
    "x": "x twitter",
    "bereal": "bereal",
    "instagram": "instagram",
    "deliveroo": "deliveroo",
    "telephone": "telephone apple",
    "messages": "messages apple",
    "safari": "safari apple",
    "photo": "appareil photo apple",
}


def cherche(terme):
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": terme, "entity": "software", "limit": 3, "country": "fr"}
    )
    with urllib.request.urlopen(url, timeout=20) as r:
        donnees = json.load(r)
    for res in donnees.get("results", []):
        art = res.get("artworkUrl512") or res.get("artworkUrl100")
        if art:
            return res["trackName"], art.replace("512x512bb.jpg", "512x512bb.png")
    return None, None


for nom, terme in APPLIS.items():
    titre, url = cherche(terme)
    if not url:
        print("  ! introuvable :", nom)
        continue
    with urllib.request.urlopen(url, timeout=20) as r:
        image = Image.open(io.BytesIO(r.read())).convert("RGB")
    image.resize((120, 120), Image.LANCZOS).save(SORTIE / f"{nom}.webp", quality=88, method=6)
    print(f"  {nom}.webp <- {titre}")
