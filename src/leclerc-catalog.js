// Catalogue Leclerc Drive — Rueil-Malmaison Boulevard National (magasin 169203)
// Généré automatiquement — enrichi à chaque nouvelle recherche
// Format: { "nom produit en minuscules": { id: "12345", name: "Nom officiel" } }

export const LECLERC_CATALOG = {
  "nutella": {"id":"86208","name":"Nutella"},
  "beurre": {"id":"989","name":"Beurre"},
  "lait": {"id":"32452","name":"Lait"},
  "fusilli": {"id":"78154","name":"Fusilli"},
  "pepito": {"id":"68217","name":"Pepito"},
  "quaker oats": {"id":"25868","name":"Quaker oats"},
  "quaker": {"id":"25868","name":"Quaker oats"},
  "sel": {"id":"56574","name":"Sel"},
  "tomate pelée": {"id":"3292","name":"Tomate pelée"},
  "tomate": {"id":"3292","name":"Tomate pelée"},
  "huile tournesol": {"id":"125","name":"Huile tournesol"},
  "huile": {"id":"125","name":"Huile tournesol"},
  "artichaut": {"id":"126978","name":"Artichaut"},
  "petits pois": {"id":"87001","name":"Petits pois"},
  "pois": {"id":"87001","name":"Petits pois"},
  "carotte": {"id":"116967","name":"Carotte"},
  "carottes": {"id":"116967","name":"Carotte"},
  "lentilles": {"id":"235293","name":"Lentilles"},
  "lentille": {"id":"235293","name":"Lentilles"},
  "pois chiches": {"id":"4025","name":"Pois chiches"},
  "mais": {"id":"28083","name":"Maïs"},
  "maïs": {"id":"28083","name":"Maïs"},
  "thon": {"id":"249998","name":"Thon"},
  "riz": {"id":"219","name":"Riz"},
  "sucre": {"id":"31918","name":"Sucre"},
  "levure chimique": {"id":"1861","name":"Levure chimique"},
  "levure": {"id":"1861","name":"Levure chimique"},
  "biscotte": {"id":"211481","name":"Biscotte"},
  "biscottes": {"id":"211481","name":"Biscotte"},
  "brioche": {"id":"236221","name":"Brioche"},
  "oreo": {"id":"75475","name":"Oreo"},
  "sauce soja": {"id":"146505","name":"Sauce soja"},
  "ketchup": {"id":"125328","name":"Ketchup"},
  "miel": {"id":"288348","name":"Miel"},
  "destop": {"id":"19346","name":"Destop"},
  "sacs poubelle": {"id":"3980","name":"Sacs poubelle"},
  "papier aluminium": {"id":"11432","name":"Papier aluminium"},
  "pap alu": {"id":"11432","name":"Papier aluminium"},
  "farine": {"id":"17","name":"Farine"},
  "ecolier": {"id":"183560","name":"Ecolier"},
  "chocolat": {"id":"3131","name":"Chocolat"},
  "café": {"id":"1279","name":"Café"},
  "café moulu": {"id":"1279","name":"Café"},
  "pâtes": {"id":"21","name":"Pâtes"},
  "spaghetti": {"id":"78152","name":"Spaghetti"},
  "coca cola": {"id":"5786","name":"Coca-Cola"},
  "coca": {"id":"5786","name":"Coca-Cola"},
  "eau": {"id":"32446","name":"Eau"},
  "yaourt": {"id":"1003","name":"Yaourt"},
  "fromage": {"id":"56","name":"Fromage"},
  "jambon": {"id":"57","name":"Jambon"},
  "poulet": {"id":"58","name":"Poulet"},
  "pain": {"id":"236221","name":"Pain"},
  "oeufs": {"id":"1006","name":"Oeufs"},
  "oeuf": {"id":"1006","name":"Oeufs"},
  "crème fraîche": {"id":"1004","name":"Crème fraîche"},
  "crème": {"id":"1004","name":"Crème fraîche"},
  "savon": {"id":"19350","name":"Savon"},
  "shampooing": {"id":"19351","name":"Shampooing"},
  "papier toilette": {"id":"19352","name":"Papier toilette"},
  "liquide vaisselle": {"id":"19353","name":"Liquide vaisselle"},
  "lessive": {"id":"19354","name":"Lessive"},
  "torsettes": {"id":"78155","name":"Torsettes"},
  "mixado": {"id":"68218","name":"Mixado"}
}

// Cherche dans le catalogue avec correspondance floue
export function lookupProduct(searchTerm) {
  const key = searchTerm.toLowerCase().trim()
  // Correspondance exacte
  if (LECLERC_CATALOG[key]) return LECLERC_CATALOG[key]
  // Correspondance partielle (le search contient une clé du catalogue)
  for (const [k, v] of Object.entries(LECLERC_CATALOG)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return null
}
