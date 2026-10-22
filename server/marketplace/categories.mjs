// Catégories de la marketplace, inspirées des grandes places de marché et adaptées aux produits vendus
// en Afrique de l’Ouest. Les catégories où l’on compare des performances ont des caractéristiques
// précises (saisies par le vendeur) : elles servent aux filtres et, plus tard, aux recommandations.

/**
 * @typedef {{ key: string, label: string, type: 'text' | 'number' | 'select' | 'boolean', unit?: string, options?: string[], max?: number }} Attribute
 * @typedef {{ id: string, label: string }} Subcategory
 * @typedef {{ id: string, label: string, subcategories: Subcategory[], attributes?: Attribute[] }} Category
 */

const brand = /** @type {Attribute} */ ({ key: 'marque', label: 'Marque', type: 'text', max: 40 })
const model = /** @type {Attribute} */ ({ key: 'modele', label: 'Modèle', type: 'text', max: 60 })
const color = /** @type {Attribute} */ ({ key: 'couleur', label: 'Couleur', type: 'text', max: 30 })
const warranty = /** @type {Attribute} */ ({ key: 'garantie_mois', label: 'Garantie', type: 'number', unit: 'mois', max: 120 })

/** @param {string} id @param {string} label */
const sub = (id, label) => ({ id, label })

/** @type {Category[]} */
export const CATEGORIES = [
  {
    id: 'telephones', label: 'Téléphones et accessoires',
    subcategories: [sub('smartphones', 'Smartphones'), sub('telephones-simples', 'Téléphones simples'), sub('tablettes', 'Tablettes'), sub('accessoires-telephone', 'Accessoires (coques, chargeurs, écouteurs)'), sub('montres-connectees', 'Montres connectées')],
    attributes: [brand, model, { key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go', max: 64 }, { key: 'stockage_go', label: 'Stockage', type: 'number', unit: 'Go', max: 2048 },
      { key: 'batterie_mah', label: 'Batterie', type: 'number', unit: 'mAh', max: 30000 }, { key: 'ecran_pouces', label: 'Écran', type: 'number', unit: 'pouces', max: 20 },
      { key: 'reseau', label: 'Réseau', type: 'select', options: ['2G', '3G', '4G', '5G'] }, { key: 'double_sim', label: 'Double SIM', type: 'boolean' }, color, warranty],
  },
  {
    id: 'informatique', label: 'Informatique',
    subcategories: [sub('ordinateurs-portables', 'Ordinateurs portables'), sub('ordinateurs-bureau', 'Ordinateurs de bureau'), sub('imprimantes', 'Imprimantes et scanners'), sub('stockage', 'Clés USB et disques'), sub('reseau', 'Réseau et Wi-Fi'), sub('accessoires-informatique', 'Accessoires informatiques')],
    attributes: [brand, model, { key: 'processeur', label: 'Processeur', type: 'text', max: 60 }, { key: 'ram_go', label: 'Mémoire vive (RAM)', type: 'number', unit: 'Go', max: 256 },
      { key: 'stockage_go', label: 'Stockage', type: 'number', unit: 'Go', max: 16384 }, { key: 'type_stockage', label: 'Type de stockage', type: 'select', options: ['SSD', 'HDD', 'eMMC'] },
      { key: 'ecran_pouces', label: 'Écran', type: 'number', unit: 'pouces', max: 40 }, warranty],
  },
  {
    id: 'tv-audio-photo', label: 'TV, audio et photo',
    subcategories: [sub('televiseurs', 'Téléviseurs'), sub('decodeurs', 'Décodeurs et antennes'), sub('audio', 'Enceintes et chaînes hi-fi'), sub('casques', 'Casques et écouteurs'), sub('photo-video', 'Appareils photo et caméras')],
    attributes: [brand, model, { key: 'ecran_pouces', label: 'Taille d’écran', type: 'number', unit: 'pouces', max: 120 }, { key: 'resolution', label: 'Résolution', type: 'select', options: ['HD', 'Full HD', '4K', '8K'] },
      { key: 'smart_tv', label: 'Smart TV', type: 'boolean' }, warranty],
  },
  {
    id: 'electromenager', label: 'Électroménager',
    subcategories: [sub('refrigerateurs', 'Réfrigérateurs et congélateurs'), sub('climatisation', 'Climatiseurs et ventilateurs'), sub('cuisson', 'Cuisinières, fours et réchauds'), sub('petit-electromenager', 'Petit électroménager (mixeurs, bouilloires…)'), sub('lavage', 'Machines à laver'), sub('fers-a-repasser', 'Fers à repasser')],
    attributes: [brand, model, { key: 'capacite', label: 'Capacité', type: 'text', max: 30 }, { key: 'puissance_w', label: 'Puissance', type: 'number', unit: 'W', max: 100000 }, warranty],
  },
  {
    id: 'energie-solaire', label: 'Énergie et solaire',
    subcategories: [sub('panneaux-solaires', 'Panneaux solaires'), sub('batteries', 'Batteries'), sub('onduleurs', 'Onduleurs et régulateurs'), sub('groupes-electrogenes', 'Groupes électrogènes'), sub('eclairage', 'Lampes et éclairage')],
    attributes: [brand, { key: 'puissance_w', label: 'Puissance', type: 'number', unit: 'W', max: 100000 }, { key: 'capacite_ah', label: 'Capacité', type: 'number', unit: 'Ah', max: 10000 }, { key: 'tension_v', label: 'Tension', type: 'number', unit: 'V', max: 1000 }, warranty],
  },
  {
    id: 'mode-femme', label: 'Mode femme',
    subcategories: [sub('robes', 'Robes et ensembles'), sub('pagnes-tissus', 'Pagnes et tissus'), sub('chaussures-femme', 'Chaussures'), sub('sacs', 'Sacs et maroquinerie'), sub('vetements-femme', 'Autres vêtements')],
    attributes: [{ key: 'taille', label: 'Taille', type: 'text', max: 20 }, color, { key: 'matiere', label: 'Matière', type: 'text', max: 40 }],
  },
  {
    id: 'mode-homme', label: 'Mode homme',
    subcategories: [sub('chemises-boubous', 'Chemises, boubous et ensembles'), sub('pantalons', 'Pantalons'), sub('chaussures-homme', 'Chaussures'), sub('vetements-homme', 'Autres vêtements')],
    attributes: [{ key: 'taille', label: 'Taille', type: 'text', max: 20 }, color, { key: 'matiere', label: 'Matière', type: 'text', max: 40 }],
  },
  {
    id: 'enfants-bebes', label: 'Enfants et bébés',
    subcategories: [sub('vetements-enfant', 'Vêtements'), sub('puericulture', 'Puériculture (poussettes, biberons…)'), sub('jouets', 'Jouets et jeux'), sub('couches', 'Couches et soins')],
    attributes: [{ key: 'age', label: 'Âge conseillé', type: 'text', max: 30 }, { key: 'taille', label: 'Taille', type: 'text', max: 20 }],
  },
  {
    id: 'beaute', label: 'Beauté et soins',
    subcategories: [sub('cheveux', 'Cheveux, mèches et perruques'), sub('soins-peau', 'Soins de la peau'), sub('maquillage', 'Maquillage'), sub('parfums', 'Parfums'), sub('hygiene', 'Hygiène')],
    attributes: [brand, { key: 'contenance', label: 'Contenance', type: 'text', max: 30 }],
  },
  {
    id: 'sante-bien-etre', label: 'Santé et bien-être (sans médicaments)',
    subcategories: [sub('materiel-medical', 'Matériel médical (tensiomètres, thermomètres…)'), sub('protection', 'Masques et protection'), sub('complements', 'Compléments alimentaires autorisés')],
    attributes: [brand],
  },
  {
    id: 'alimentation', label: 'Alimentation et boissons',
    subcategories: [sub('cereales', 'Céréales, riz et farines'), sub('huiles', 'Huiles et condiments'), sub('boissons', 'Boissons'), sub('produits-locaux', 'Produits locaux (karité, soumbala, miel…)'), sub('epicerie', 'Épicerie')],
    attributes: [brand, { key: 'poids', label: 'Poids ou volume', type: 'text', max: 30 }, { key: 'origine', label: 'Origine', type: 'text', max: 40 }],
  },
  {
    id: 'agriculture-elevage', label: 'Agriculture et élevage',
    subcategories: [sub('semences', 'Semences et plants'), sub('engrais', 'Engrais'), sub('materiel-agricole', 'Matériel agricole'), sub('elevage', 'Aliments et matériel d’élevage'), sub('irrigation', 'Irrigation')],
    attributes: [brand, { key: 'poids', label: 'Poids ou volume', type: 'text', max: 30 }],
  },
  {
    id: 'maison', label: 'Maison et meubles',
    subcategories: [sub('meubles', 'Meubles'), sub('literie', 'Literie et matelas'), sub('cuisine', 'Cuisine et vaisselle'), sub('decoration', 'Décoration'), sub('nettoyage', 'Entretien et nettoyage')],
    attributes: [{ key: 'dimensions', label: 'Dimensions', type: 'text', max: 40 }, { key: 'matiere', label: 'Matière', type: 'text', max: 40 }, color],
  },
  {
    id: 'btp-quincaillerie', label: 'BTP, outils et quincaillerie',
    subcategories: [sub('materiaux', 'Matériaux de construction'), sub('outils', 'Outils'), sub('plomberie', 'Plomberie'), sub('electricite', 'Électricité'), sub('peinture', 'Peinture')],
    attributes: [brand, { key: 'dimensions', label: 'Dimensions', type: 'text', max: 40 }],
  },
  {
    id: 'auto-moto', label: 'Auto et moto',
    subcategories: [sub('motos', 'Motos et tricycles'), sub('voitures', 'Voitures'), sub('pieces-moto', 'Pièces moto'), sub('pieces-auto', 'Pièces auto'), sub('pneus', 'Pneus'), sub('accessoires-auto', 'Accessoires')],
    attributes: [brand, model, { key: 'annee', label: 'Année', type: 'number', max: 2100 }, { key: 'cylindree_cc', label: 'Cylindrée', type: 'number', unit: 'cm³', max: 10000 },
      { key: 'kilometrage_km', label: 'Kilométrage', type: 'number', unit: 'km', max: 2000000 }, { key: 'carburant', label: 'Carburant', type: 'select', options: ['Essence', 'Diesel', 'Électrique', 'Hybride'] }],
  },
  {
    id: 'sport-loisirs', label: 'Sport et loisirs',
    subcategories: [sub('football', 'Football'), sub('fitness', 'Fitness et musculation'), sub('velos', 'Vélos'), sub('instruments', 'Instruments de musique'), sub('jeux-video', 'Consoles et jeux vidéo')],
    attributes: [brand, { key: 'taille', label: 'Taille', type: 'text', max: 20 }],
  },
  {
    id: 'bureau-ecole', label: 'Bureau, école et livres',
    subcategories: [sub('fournitures', 'Fournitures scolaires et de bureau'), sub('livres', 'Livres'), sub('mobilier-bureau', 'Mobilier de bureau')],
  },
  {
    id: 'bijoux-montres', label: 'Bijoux et montres',
    subcategories: [sub('bijoux', 'Bijoux'), sub('montres', 'Montres'), sub('lunettes', 'Lunettes')],
    attributes: [brand, { key: 'matiere', label: 'Matière', type: 'text', max: 40 }],
  },
  {
    id: 'equipement-pro', label: 'Équipement professionnel',
    subcategories: [sub('commerce', 'Commerce (balances, caisses, présentoirs)'), sub('restauration', 'Restauration'), sub('couture', 'Couture (machines, tissus)'), sub('coiffure', 'Coiffure et esthétique'), sub('impression', 'Impression et sérigraphie')],
    attributes: [brand, model, warranty],
  },
  {
    id: 'autres', label: 'Autres',
    subcategories: [sub('divers', 'Divers')],
  },
]

/** États possibles d’un article. */
export const CONDITIONS = { new: 'Neuf', used: 'Occasion', refurbished: 'Reconditionné' }

/** @param {string} id */
export const findCategory = (id) => CATEGORIES.find((category) => category.id === id)

/**
 * Garde seulement les caractéristiques prévues pour la catégorie, au bon format ; ignore le reste.
 * @param {string} categoryId @param {unknown} input
 * @returns {Record<string, string | number | boolean>}
 */
export function cleanAttributes(categoryId, input) {
  /** @type {Record<string, string | number | boolean>} */
  const cleaned = {}
  const attributes = findCategory(categoryId)?.attributes ?? []
  if (!input || typeof input !== 'object') return cleaned
  for (const attribute of attributes) {
    const value = /** @type {Record<string, unknown>} */ (input)[attribute.key]
    if (value === undefined || value === null || value === '') continue
    if (attribute.type === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (attribute.max ?? 1e9)) cleaned[attribute.key] = Math.round(value * 100) / 100
    if (attribute.type === 'boolean' && typeof value === 'boolean') cleaned[attribute.key] = value
    if (attribute.type === 'select' && typeof value === 'string' && attribute.options?.includes(value)) cleaned[attribute.key] = value
    if (attribute.type === 'text' && typeof value === 'string' && value.trim()) cleaned[attribute.key] = value.trim().slice(0, attribute.max ?? 60)
  }
  return cleaned
}
