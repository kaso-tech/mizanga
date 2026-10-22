// Parcours d’un commerçant sur téléphone Android (écran, tactile, navigateur Chrome mobile émulés) :
// connexion, commerce, produits, stock, ventes, dépenses, résultats, assistant et formule ; puis
// bouton « retour », clavier ouvert, réseau lent et hors connexion. Les montants sont vérifiés au franc près.
import { expect, test } from '@playwright/test'

const LOGIN_CODE = '123456'
let accounts = 0
/** Adresse unique par test et par appareil (une base partagée, un commerce par compte). @param {import('@playwright/test').TestInfo} info */
const emailFor = (info) => `commercant-${info.project.name.replace(/\W+/g, '-')}-${Date.now()}-${++accounts}@example.bf`

/**
 * Vérifie qu’aucun élément visible ne dépasse à droite de l’écran (hors zones prévues pour défiler :
 * tableaux, onglets). Un débordement caché par le conteneur ne se voit pas avec scrollWidth seul.
 * @param {import('@playwright/test').Page} page @param {string} screen
 */
async function expectFitsScreen(page, screen) {
  const overflowing = await page.evaluate(() => {
    const width = window.innerWidth
    const scrollable = (/** @type {Element} */ element) => element.closest('.table-scroll, .business-tabs, .market-categories, .settings-nav, .moderation-photos, pre, .katex-display')
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && box.right > width + 1 && !scrollable(element) && getComputedStyle(element).visibility !== 'hidden'
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} (${Math.round(element.getBoundingClientRect().right)} px)`)
  })
  expect(overflowing, `Débordement horizontal : ${screen}`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Défilement horizontal : ${screen}`).toBe(true)
}

/** Connexion par code (faux service d’authentification) et création du commerce. @param {import('@playwright/test').Page} page @param {string} email */
async function signInAndCreateShop(page, email, shopName = 'Boutique Awa') {
  await page.goto('/business')
  await page.locator('.business-welcome').getByRole('button', { name: 'Se connecter' }).tap()
  await page.getByRole('textbox', { name: /e-mail/i }).fill(email)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'J’ai reçu un code' }).tap()
  await page.locator('input[autocomplete="one-time-code"]').fill(LOGIN_CODE)
  await page.keyboard.press('Enter')
  await page.getByLabel('Nom du commerce').fill(shopName)
  await page.getByRole('button', { name: 'Créer' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: shopName })).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {{ name: string, unit: string, buy: string, sell: string, quantity: string, alert?: string }} product */
async function addProduct(page, product) {
  await page.getByRole('button', { name: /Ajouter un produit/ }).tap()
  const dialog = page.getByRole('dialog', { name: 'Nouveau produit' })
  await dialog.getByLabel('Nom', { exact: true }).fill(product.name)
  await dialog.getByLabel('Unité').fill(product.unit)
  await dialog.getByLabel('Prix d’achat').fill(product.buy)
  await dialog.getByLabel('Prix de vente').fill(product.sell)
  await dialog.getByLabel('Stock initial').fill(product.quantity)
  if (product.alert) await dialog.getByLabel('Seuil d’alerte').fill(product.alert)
  await dialog.getByRole('button', { name: 'Ajouter le produit' }).tap()
  await expect(dialog).toBeHidden()
}

/** Texte sans espaces insécables, pour comparer les montants. @param {string | null} text */
const plain = (text) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()

test('parcours complet du commerçant', async ({ page }, info) => {
  await signInAndCreateShop(page, emailFor(info))
  await expectFitsScreen(page, 'commerce créé')

  await addProduct(page, { name: 'Riz 25 kg', unit: 'sac', buy: '15 000', sell: '17 500', quantity: '10', alert: '9' })
  await addProduct(page, { name: 'Sucre', unit: 'kg', buy: '600', sell: '750', quantity: '4' })
  await expectFitsScreen(page, 'liste des produits')

  // Achat de 2,5 sacs (virgule décimale) puis historique.
  await page.getByRole('button', { name: 'Mouvement de stock pour Riz 25 kg' }).tap()
  const movement = page.getByRole('dialog', { name: 'Stock : Riz 25 kg' })
  await movement.getByLabel('Quantité (sac)').fill('2,5')
  await expectFitsScreen(page, 'fenêtre de mouvement de stock')
  await movement.getByRole('button', { name: 'Enregistrer' }).tap()
  await expect(page.locator('.product-card', { hasText: 'Riz 25 kg' })).toContainText('12,5')
  await page.getByRole('button', { name: 'Historique de Riz 25 kg' }).tap()
  await expect(page.getByRole('dialog', { name: 'Historique : Riz 25 kg' })).toContainText('+2,5 sac')
  await page.getByRole('button', { name: 'Fermer', exact: true }).tap()

  // Vente de deux produits, dont un à prix négocié.
  await page.getByRole('tab', { name: 'Ventes' }).tap()
  await page.getByRole('button', { name: /Nouvelle vente/ }).tap()
  const sale = page.getByRole('dialog', { name: 'Nouvelle vente' })
  await sale.getByRole('combobox', { name: /^Produit 1/ }).selectOption({ label: 'Riz 25 kg (12,5 sac)' })
  await sale.getByLabel('Quantité (sac)').fill('2')
  await sale.getByLabel('Prix unitaire').fill('17 000')
  await sale.getByRole('button', { name: /Ajouter un produit/ }).tap()
  await sale.getByRole('combobox', { name: /^Produit 2/ }).selectOption({ label: 'Sucre (4 kg)' })
  await sale.getByLabel('Quantité (kg) 2').fill('0,5')
  await sale.getByLabel('Client (facultatif)').fill('Mariam')
  expect(plain(await sale.locator('.sale-total').textContent())).toBe('Total : 34 375 F CFA')
  await expectFitsScreen(page, 'fenêtre de vente')
  await sale.getByRole('button', { name: 'Enregistrer la vente' }).tap()
  await expect(sale).toBeHidden()
  await expect(page.getByRole('list', { name: 'Liste des ventes' })).toContainText('Client : Mariam')
  await expectFitsScreen(page, 'liste des ventes')

  // Dépense.
  await page.getByRole('tab', { name: 'Dépenses' }).tap()
  await page.getByRole('button', { name: /Nouvelle dépense/ }).tap()
  const expense = page.getByRole('dialog', { name: 'Nouvelle dépense' })
  await expense.getByLabel('Montant').fill('6 500')
  await expense.getByLabel('Catégorie').selectOption('Transport')
  await expectFitsScreen(page, 'fenêtre de dépense')
  await expense.getByRole('button', { name: 'Enregistrer la dépense' }).tap()
  await expect(page.getByRole('list', { name: 'Liste des dépenses' })).toContainText('Transport')

  // Résultats calculés par la base : 2 × 17 000 + 0,5 × 750 = 34 375 ; coût 30 000 + 300 = 30 300.
  await page.getByRole('tab', { name: 'Résultats' }).tap()
  const figures = page.locator('.results-grid')
  await expect(figures).toContainText('Résultat estimé')
  const value = async (/** @type {string} */ label) => plain(await figures.locator('div', { hasText: label }).locator('dd').textContent())
  expect(await value('Chiffre d’affaires')).toBe('34 375 F CFA')
  expect(await value('Coût des produits vendus')).toBe('30 300 F CFA')
  expect(await value('Marge brute')).toBe('4 075 F CFA')
  expect(await value('Dépenses')).toBe('6 500 F CFA')
  expect(await value('Résultat estimé')).toBe('-2 425 F CFA')
  await expect(page.getByText('ce n’est pas un résultat comptable ou fiscal certifié')).toBeVisible()
  await expectFitsScreen(page, 'résultats')

  // Assistant : la réponse (moteur simulé) reprend les chiffres transmis par le serveur.
  await page.getByRole('tab', { name: 'Assistant' }).tap()
  await expect(page.getByText('50 questions restantes aujourd’hui')).toBeVisible()
  await page.getByRole('button', { name: 'Comment se passent mes ventes ce mois-ci ?' }).tap()
  await expect(page.getByRole('article', { name: 'Réponse de Gilli' })).toContainText('chiffre d’affaires 34375')
  await expect(page.getByText('49 questions restantes aujourd’hui')).toBeVisible()
  await expectFitsScreen(page, 'assistant')

  // Formule (mode test).
  await page.getByRole('button', { name: /Formule et limites/ }).tap()
  const plan = page.getByRole('dialog', { name: 'Votre formule' })
  await expect(plan).toContainText('Test (gratuit)')
  await expect(plan).toContainText('1 sur 50 aujourd’hui')
  await expectFitsScreen(page, 'formule')
})

test('assistant : une photo et une phrase préparent une fiche de produit, enregistrée après confirmation', async ({ page }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Photo')
  await page.getByRole('tab', { name: 'Assistant' }).tap()
  // Petite image PNG valide (1 × 1 pixel).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type="file"]').setInputFiles({ name: 'huile.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('huile.png')).toBeVisible()
  await page.getByRole('textbox', { name: 'Votre question' }).fill('Enregistre cette huile : achat 9000, j’en ai 12 bidons')
  await page.getByRole('button', { name: 'Envoyer' }).tap()
  const card = page.getByRole('form', { name: 'Fiche à vérifier : Nouveau produit' })
  await expect(card).toBeVisible()
  await expect(card.getByLabel('Nom')).toHaveValue('Huile Dinor 5 L')
  await expectFitsScreen(page, 'fiche de produit')
  // Rien n’est encore enregistré.
  await page.getByRole('tab', { name: 'Produits' }).tap()
  await expect(page.getByText('Ajoutez votre premier produit')).toBeVisible()
  // De retour sur l’assistant, la conversation et la fiche en attente sont toujours là.
  await page.getByRole('tab', { name: 'Assistant' }).tap()
  await expect(card).toBeVisible()
  await card.getByLabel(/Prix de vente/).fill('10 500')
  await card.getByRole('button', { name: 'Confirmer et enregistrer' }).tap()
  await expect(card).toContainText('Produit « Huile Dinor 5 L » enregistré.')
  await page.getByRole('tab', { name: 'Produits' }).tap()
  await expect(page.locator('.product-card', { hasText: 'Huile Dinor 5 L' })).toContainText('12')
  await expect(page.locator('.product-card', { hasText: 'Huile Dinor 5 L' })).toContainText('10 500')
})

test('assistant : une phrase prépare une vente et une dépense, enregistrées après confirmation', async ({ page }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Ventes')
  await addProduct(page, { name: 'Savon', unit: 'pièce', buy: '250', sell: '300', quantity: '20' })
  await page.getByRole('tab', { name: 'Assistant' }).tap()
  await page.getByRole('textbox', { name: 'Votre question' }).fill('Vends 2 savons à Mariam, et ajoute 1500 de transport')
  await page.getByRole('button', { name: 'Envoyer' }).tap()
  const sale = page.getByRole('form', { name: 'Fiche à vérifier : Vente' })
  await expect(sale.getByLabel('Prix unitaire 1')).toHaveValue('300')
  expect(plain(await sale.locator('.sale-total').textContent())).toBe('Total : 600 F CFA')
  await expectFitsScreen(page, 'fiches de vente et de dépense')
  await sale.getByRole('button', { name: 'Confirmer et enregistrer' }).tap()
  await expect(sale).toContainText('Vente de 600 F CFA enregistrée.')
  const expense = page.getByRole('form', { name: 'Fiche à vérifier : Dépense' })
  await expense.getByRole('button', { name: 'Confirmer et enregistrer' }).tap()
  await expect(expense).toContainText('Dépense de 1 500 F CFA enregistrée (Transport).')
  // Les onglets montrent les enregistrements : stock diminué, vente et dépense du jour.
  await page.getByRole('tab', { name: 'Produits' }).tap()
  await expect(page.locator('.product-card', { hasText: 'Savon' })).toContainText('18')
  await page.getByRole('tab', { name: 'Ventes' }).tap()
  await expect(page.getByRole('list', { name: 'Liste des ventes' })).toContainText('Client : Mariam')
  await page.getByRole('tab', { name: 'Dépenses' }).tap()
  await expect(page.getByRole('list', { name: 'Liste des dépenses' })).toContainText('Transport')
})

/** Publie un produit sur la marketplace (vitrine créée au besoin) ; renvoie le badge d’état affiché. @param {import('@playwright/test').Page} page @param {string} productName @param {string} title */
async function publishListing(page, productName, title, withPhoto = true) {
  await page.getByRole('button', { name: `Publier sur la marketplace : ${productName}` }).tap()
  const seller = page.getByRole('dialog', { name: 'Ma vitrine' })
  if (await seller.isVisible().catch(() => false)) {
    await seller.getByLabel('Ville', { exact: true }).fill('Ouagadougou')
    await seller.getByLabel('Numéro WhatsApp').fill('70 12 34 56')
    await seller.getByRole('button', { name: 'Enregistrer ma vitrine' }).tap()
  }
  const dialog = page.getByRole('dialog', { name: 'Publier sur la marketplace' })
  await dialog.getByLabel('Titre de l’annonce').fill(title)
  await dialog.getByRole('combobox', { name: /^Catégorie/ }).selectOption('telephones')
  await dialog.getByRole('combobox', { name: /^Sous-catégorie/ }).selectOption('smartphones')
  await dialog.getByLabel('Mémoire vive (RAM) (Go)').fill('8')
  if (withPhoto) {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
    await expect(dialog.getByText('Photos (1/5)')).toBeVisible()
  }
  await expectFitsScreen(page, 'publication d’une annonce')
  await dialog.getByRole('button', { name: 'Publier' }).tap()
  await expect(dialog).toBeHidden()
  return page.locator('.product-card', { hasText: productName }).locator('.listing-badge')
}

test('marketplace : un vendeur publie, un visiteur trouve l’annonce et contacte le vendeur', async ({ page, browser }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Awa Téléphones')
  await addProduct(page, { name: 'Tecno Spark 20', unit: 'pièce', buy: '40 000', sell: '48 000', quantity: '3' })
  const badge = await publishListing(page, 'Tecno Spark 20', `Tecno Spark 20 neuf ${info.project.name.includes('360') ? 'A' : 'B'}`)
  await expect(badge).toHaveText('En ligne')

  // Un visiteur, sans compte, sur un autre téléphone.
  const visitor = await browser.newPage({ ...info.project.use })
  await visitor.goto('/marketplace')
  await visitor.getByRole('searchbox', { name: 'Que cherchez-vous ?' }).fill(`tecno spark 20 neuf ${info.project.name.includes('360') ? 'A' : 'B'}`)
  await visitor.getByLabel('Ma ville').fill('Ouagadougou')
  await visitor.getByLabel('Budget maximum').fill('50000')
  await visitor.getByRole('button', { name: 'Rechercher' }).tap()
  const card = visitor.locator('.market-card').first()
  await expect(card).toContainText('48 000')
  await expectFitsScreen(visitor, 'résultats de la marketplace')
  await card.locator('a').tap()
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Tecno Spark 20 neuf')
  await expect(visitor.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/22670123456\?text=/)
  await expect(visitor.locator('.market-photos img')).toHaveCount(1)
  expect(await visitor.locator('.market-photos img').evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)).toBe(1)
  await expectFitsScreen(visitor, 'page d’une annonce')
  await visitor.close()
})

test('marketplace : un article interdit part en vérification et l’administration le refuse', async ({ page, browser }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Douteuse')
  await addProduct(page, { name: 'Article X', unit: 'pièce', buy: '1000', sell: '2000', quantity: '1' })
  const badge = await publishListing(page, 'Article X', `Pistolet automatique ${info.project.name}`, false)
  await expect(badge).toHaveText('En vérification')

  const admin = await browser.newPage({ ...info.project.use })
  await admin.goto('/admin')
  await admin.getByLabel(/Mot de passe/).fill('mot-de-passe-admin-e2e')
  await admin.keyboard.press('Enter')
  await admin.getByRole('tab', { name: 'Modération marketplace' }).tap()
  const item = admin.locator('.moderation-card', { hasText: `Pistolet automatique ${info.project.name}` })
  await expect(item).toContainText('« pistolet »')
  await expectFitsScreen(admin, 'console de modération')
  await item.getByLabel(/Motif communiqué/).fill('Arme interdite')
  await item.getByRole('button', { name: 'Refuser' }).tap()
  await expect(item).toBeHidden()
  await admin.close()

  await page.reload()
  await expect(page.locator('.product-card', { hasText: 'Article X' }).locator('.listing-badge')).toHaveText('Refusée')
  await page.getByRole('button', { name: 'Annonce : Article X' }).tap()
  await expect(page.getByRole('dialog', { name: 'Modifier l’annonce' })).toContainText('Administration : Arme interdite')
})

test('le bouton « retour » d’Android ferme la fenêtre sans quitter l’espace Business', async ({ page }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Retour')
  await page.getByRole('button', { name: /Ajouter un produit/ }).tap()
  await expect(page.getByRole('dialog', { name: 'Nouveau produit' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Nouveau produit' })).toBeHidden()
  await expect(page).toHaveURL(/\/business$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Boutique Retour' })).toBeVisible()
  // Fermée par la croix, la fenêtre ne laisse pas d’étape inutile dans l’historique.
  await page.getByRole('button', { name: /Ajouter un produit/ }).tap()
  await page.getByRole('button', { name: 'Fermer', exact: true }).tap()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.history.state?.gilliModal)).toBeUndefined()
})

test('clavier ouvert : la fenêtre de vente reste utilisable', async ({ page }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Clavier')
  await addProduct(page, { name: 'Savon', unit: 'pièce', buy: '250', sell: '300', quantity: '20' })
  await page.getByRole('tab', { name: 'Ventes' }).tap()
  // Le clavier virtuel réduit la hauteur visible à environ 330 px.
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 360, height: 330 })
  await page.getByRole('button', { name: /Nouvelle vente/ }).tap()
  const sale = page.getByRole('dialog', { name: 'Nouvelle vente' })
  const box = await sale.boundingBox()
  expect(box && box.y >= 0 && box.y + box.height <= 331).toBe(true)
  await sale.getByRole('combobox', { name: /^Produit 1/ }).selectOption({ label: 'Savon (20 pièce)' })
  const submit = sale.getByRole('button', { name: 'Enregistrer la vente' })
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeInViewport()
  await submit.tap()
  await expect(sale).toBeHidden()
  await expect(page.getByRole('list', { name: 'Liste des ventes' })).toContainText('300 F CFA')
})

test('accueil du chatbot : zone de saisie en bas de l’écran et bouton d’envoi rond', async ({ page }) => {
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Votre message' })
  await expect(input).toBeVisible()
  const viewport = page.viewportSize()
  const composer = await page.locator('.composer').boundingBox()
  // Le bas de la zone de saisie est à moins de 120 px du bas de l’écran (avertissement compris).
  expect(composer && viewport && viewport.height - (composer.y + composer.height)).toBeLessThan(120)
  await input.fill('Bonjour')
  const send = page.getByRole('button', { name: 'Envoyer' })
  const box = await send.boundingBox()
  expect(box && Math.round(box.width)).toBe(34)
  expect(await send.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('50%')
  await expectFitsScreen(page, 'accueil du chatbot')
})

test('réseau lent (3G) : l’application s’affiche en moins de 15 secondes', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  // Profil « 3G lent » de Chrome : 400 ms de latence, environ 50 ko/s.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 })
  const start = Date.now()
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible({ timeout: 15_000 })
  const elapsed = Date.now() - start
  test.info().annotations.push({ type: 'Affichage en 3G lent', description: `${(elapsed / 1000).toFixed(1)} s` })
  console.log(`[${test.info().project.name}] affichage en 3G lent : ${(elapsed / 1000).toFixed(1)} s`)
})

test('hors connexion : l’application installée s’ouvre et l’espace Business le signale', async ({ page, context }, info) => {
  await signInAndCreateShop(page, emailFor(info), 'Boutique Hors Ligne')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Boutique Hors Ligne' })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.business-view')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('hors connexion')
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()
  await context.setOffline(false)
})
