"""Regle les deux projets iOS generes par Capacitor (29/09/2026).

`npx cap add ios` produit un projet generique : icone Capacitor, paysage
autorise, aucune chaine de permission (l'appli PLANTE a la premiere demande
de camera), aucun lien de retour, notifications non relayees. Ce script pose
tout ce qui fait de ces projets les applis Noctify. Il est idempotent : le
relancer ne change rien de plus.

Il ne sert qu'apres un `cap add ios` (dossier recree). Les dossiers ios/ et
ios-gerant/ sont dans git : en temps normal on n'a pas a le relancer.

Usage : python outils/natif_ios.py
"""
import hashlib
import plistlib
import re
import shutil
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

APPLIS = {
    "ios": {
        "id": "com.noctify.app",
        "nom": "Noctify",
        "vie_privee": "mobile/PrivacyInfo.xcprivacy",
        "permissions": {
            "NSCameraUsageDescription": "Pour scanner le QR code affiché dans l'établissement et créditer tes points.",
            "NSPhotoLibraryUsageDescription": "Pour choisir la capture de ton profil Instagram, qui permet de reconnaître qui a publié.",
            "NSLocationWhenInUseUsageDescription": "Pour afficher les établissements autour de toi et vérifier, quand tu scannes un QR, que tu es bien sur place.",
        },
    },
    "ios-gerant": {
        "id": "com.noctify.gerant",
        "nom": "Noctify Gérant",
        "vie_privee": "mobile/PrivacyInfo-gerant.xcprivacy",
        "permissions": {
            "NSCameraUsageDescription": "Pour scanner le QR du bon de ton client et photographier ton établissement.",
            "NSPhotoLibraryUsageDescription": "Pour choisir les photos de ton établissement et de tes récompenses.",
            "NSPhotoLibraryAddUsageDescription": "Pour enregistrer ton affiche QR dans tes photos.",
        },
    },
}

APPDELEGATE_PUSH = '''
    // Notifications : iOS remet le jeton de l'appareil ICI, a l'appli.
    // Sans ces deux relais, le plugin PushNotifications attend un jeton qui
    // n'arrive jamais (natif.js > activerPush).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
'''

ENTITLEMENTS = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>development</string>
</dict>
</plist>
'''


def regler_info_plist(dossier, appli):
    chemin = RACINE / dossier / "App" / "App" / "Info.plist"
    with open(chemin, "rb") as f:
        info = plistlib.load(f)
    info["CFBundleDevelopmentRegion"] = "fr"
    info["CFBundleDisplayName"] = appli["nom"]
    # Le lien de retour de l'appli : Google, Apple, Instagram renvoient sur
    # com.noctify.xxx://... (natif.js > suivreLienRetour).
    info["CFBundleURLTypes"] = [
        {"CFBundleURLName": appli["id"], "CFBundleURLSchemes": [appli["id"]]}
    ]
    # Les applis qu'on ouvre par leur lien (instagram://, tiktok://).
    info["LSApplicationQueriesSchemes"] = ["instagram", "instagram-stories", "tiktok", "snssdk1233"]
    info.update(appli["permissions"])
    # Aucun chiffrement propre (HTTPS du systeme seulement) : evite la
    # question d'export a chaque envoi sur App Store Connect.
    info["ITSAppUsesNonExemptEncryption"] = False
    # Une appli de telephone, en portrait. Le paysage cassait les ecrans.
    info["UISupportedInterfaceOrientations"] = ["UIInterfaceOrientationPortrait"]
    info["UISupportedInterfaceOrientations~ipad"] = [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
    ]
    info["UIRequiredDeviceCapabilities"] = ["arm64"]
    info["UIViewControllerBasedStatusBarAppearance"] = True
    with open(chemin, "wb") as f:
        plistlib.dump(info, f, sort_keys=False)


def regler_appdelegate(dossier):
    chemin = RACINE / dossier / "App" / "App" / "AppDelegate.swift"
    texte = chemin.read_text(encoding="utf-8")
    if "capacitorDidRegisterForRemoteNotifications" in texte:
        return
    fin = texte.rstrip().rfind("}")
    texte = texte[:fin].rstrip() + "\n" + APPDELEGATE_PUSH + "}\n"
    chemin.write_text(texte, encoding="utf-8", newline="\n")


def ajouter_fichier_pbx(pbx, nom, type_fichier, ressource):
    """Ajoute App/<nom> au groupe App (et aux ressources si demande)."""
    if f"/* {nom} */" in pbx:
        return pbx
    # Identifiants stables (24 caracteres hexadecimaux, comme Xcode) : le
    # meme fichier garde le meme identifiant d'une fois sur l'autre.
    empreinte = hashlib.md5(nom.encode()).hexdigest().upper()
    ref = empreinte[:24]
    bld = empreinte[8:32]
    pbx = pbx.replace(
        "/* End PBXFileReference section */",
        f'\t\t{ref} /* {nom} */ = {{isa = PBXFileReference; lastKnownFileType = {type_fichier}; path = {nom}; sourceTree = "<group>"; }};\n/* End PBXFileReference section */',
    )
    # Le groupe App est celui qui liste Info.plist.
    pbx = re.sub(
        r"(\t\t\t\t504EC3131FED79650016851F /\* Info\.plist \*/,\n)",
        rf"\1\t\t\t\t{ref} /* {nom} */,\n",
        pbx,
        count=1,
    )
    if ressource:
        pbx = pbx.replace(
            "/* End PBXBuildFile section */",
            f"\t\t{bld} /* {nom} in Resources */ = {{isa = PBXBuildFile; fileRef = {ref} /* {nom} */; }};\n/* End PBXBuildFile section */",
        )
        pbx = pbx.replace(
            "\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n",
            f"\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n\t\t\t\t{bld} /* {nom} in Resources */,\n",
        )
    return pbx


def regler_projet(dossier, appli):
    app = RACINE / dossier / "App" / "App"
    (app / "App.entitlements").write_text(ENTITLEMENTS, encoding="utf-8", newline="\n")
    shutil.copyfile(RACINE / appli["vie_privee"], app / "PrivacyInfo.xcprivacy")

    chemin = RACINE / dossier / "App" / "App.xcodeproj" / "project.pbxproj"
    pbx = chemin.read_text(encoding="utf-8")
    pbx = ajouter_fichier_pbx(pbx, "PrivacyInfo.xcprivacy", "text.xml", True)
    pbx = ajouter_fichier_pbx(pbx, "App.entitlements", "text.plist.entitlements", False)
    # iPhone seulement : la mise en page est celle d'un telephone. Sur iPad
    # l'appli tourne quand meme, en mode iPhone.
    pbx = pbx.replace('TARGETED_DEVICE_FAMILY = "1,2";', "TARGETED_DEVICE_FAMILY = 1;")
    if "CODE_SIGN_ENTITLEMENTS" not in pbx:
        pbx = pbx.replace(
            "\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n",
            "\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n",
        )
    chemin.write_text(pbx, encoding="utf-8", newline="\n")


def main():
    for dossier, appli in APPLIS.items():
        if not (RACINE / dossier).exists():
            print("absent :", dossier)
            continue
        regler_info_plist(dossier, appli)
        regler_appdelegate(dossier)
        regler_projet(dossier, appli)
        print("ok :", dossier)


if __name__ == "__main__":
    main()
