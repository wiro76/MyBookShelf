import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES } from "./faux-service-auth.mjs";

/**
 * Preuves d'interface de la connexion — story 1.6, tâche T6 (AC 1 et AC 3).
 *
 * Elles s'exécutent sur les QUATRE projets de la matrice d'audit, y compris
 * `tablet-keyboard-landscape`, réparé par cette story : il dupliquait `desktop-keyboard` et
 * n'exerçait donc pas la branche « tablette clavier ».
 *
 * Répartition des preuves, imposée par la story : l'AC 2 (« Supabase Auth établit la session »)
 * et l'AC 4 (isolation) sont prouvés par `tests/integration/database-identity-auth-canary.mjs`
 * contre le vrai GoTrue, dans la porte `database`. Ici, on prouve ce qui se voit et s'entend :
 * la redirection, la conservation de la saisie, la liaison erreur↔champ, la règle de focus, et
 * les invariants d'accessibilité chiffrés.
 *
 * ⚠️ Aucune assertion sur un code de statut HTTP. `/bibliotheque` ne rend PAS de 307 : le
 * `loading.tsx` racine ouvre une frontière Suspense, si bien que la redirection sort en 200
 * accompagnée d'une redirection côté client. Ce qui est vérifiable — et ce qui compte pour
 * l'AC 1 — c'est l'URL finale et l'absence de toute donnée privée dans la page rendue.
 */

const IDENTIFIANTS = {
  email: "#champ-email",
  motDePasse: "#champ-mot-de-passe",
  erreurEmail: "#erreur-email",
  erreurMotDePasse: "#erreur-mot-de-passe",
  erreurIdentifiants: "#erreur-identifiants",
  resume: "#resume-erreurs",
  alerteReseau: "#alerte-reseau",
} as const;

/**
 * Ouvre l'écran de connexion et attend qu'il soit RÉELLEMENT là.
 *
 * ⚠️ Ne jamais mesurer une page juste après `goto()`. Le `loading.tsx` racine ouvre une
 * frontière Suspense : `goto()` rend la main sur l'évènement `load`, alors que le document
 * affiche encore le squelette `.loading-card`. Toute mesure prise à cet instant porte sur le
 * squelette — largeurs fausses, étiquettes absentes, et un `focus()` posé sur un nœud que
 * React remplacera l'instant d'après, d'où un contour qui « disparaît ». Les tests qui
 * remplissent un champ ne voyaient rien de tout cela : les actions Playwright attendent
 * d'elles-mêmes. Les tests de MESURE, eux, n'attendent rien — c'est à eux que sert ce passage.
 */
const ouvrirConnexion = async (page: Page, requete = "") => {
  await page.goto(`/connexion${requete}`);
  await expect(page.locator(IDENTIFIANTS.email)).toBeVisible();
  await expect(page.getByRole("button", { name: /connecter/i })).toBeVisible();
};

const soumettre = async (page: Page, email: string, motDePasse: string) => {
  await page.fill(IDENTIFIANTS.email, email);
  await page.fill(IDENTIFIANTS.motDePasse, motDePasse);
  await page.getByRole("button", { name: /connecter/i }).click();
};

/**
 * HTML effectivement RENDU, scripts retirés.
 *
 * `page.content()` inclut la charge utile RSC que Next sérialise dans des `<script>` — et
 * celle-ci contient les `searchParams` bruts de la requête, y compris une destination hostile.
 * Y chercher une chaîne interdite reviendrait à accuser la page de refléter une valeur que
 * Next transporte pour son propre compte, sans jamais l'afficher ni la placer dans un attribut.
 * Ce qui doit être vérifié, c'est le DOM que l'utilisateur reçoit : texte et attributs.
 */
const domRendu = (page: Page) =>
  page.evaluate(() => {
    const copie = document.body.cloneNode(true) as HTMLElement;
    for (const script of Array.from(copie.querySelectorAll("script, template, noscript"))) script.remove();
    return copie.innerHTML;
  });

/**
 * Rapport de contraste WCAG entre deux couleurs `rgb(...)` calculées.
 *
 * Calculé dans le test plutôt que codé en dur : les jetons de focus diffèrent entre thème clair
 * et thème sombre, et une valeur écrite à la main deviendrait fausse en silence au premier
 * changement de `globals.css`. Ce qui est vérifié est la RÈGLE (3:1), pas une couleur.
 */
const contraste = (premiere: string, seconde: string): number => {
  const luminance = (couleur: string): number => {
    const canaux = couleur.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const [r, v, b] = canaux.map((canal) => {
      const proportion = canal / 255;
      return proportion <= 0.03928 ? proportion / 12.92 : ((proportion + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * v + 0.0722 * b;
  };
  const a = luminance(premiere);
  const b = luminance(seconde);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// ── AC 1 — aucune donnée privée sans session ─────────────────────────────────────────────

test("AC 1 — sans session, la route privée ne rend aucune donnée et renvoie vers la connexion", async ({ page }) => {
  await page.goto("/bibliotheque");

  // L'URL FINALE, jamais un code de statut : voir l'en-tête du fichier.
  await expect(page).toHaveURL(/\/connexion\?destination=%2Fbibliotheque$/);
  await expect(page.getByRole("heading", { name: "Retrouve ta bibliothèque" })).toBeVisible();

  // Aucune miette de la page privée n'a été rendue : ni son titre, ni son état dégradé.
  // ⚠️ `exact: true` est indispensable : par défaut, `getByRole` compare le nom accessible par
  // SOUS-CHAÎNE insensible à la casse, et « Ta bibliothèque » est contenu dans « Retrouve ta
  // bibliothèque ». Sans ce drapeau, l'assertion échouait sur le titre de l'écran de connexion
  // lui-même — et, pire, elle aurait pu passer pour la bonne raison en croyant la mauvaise.
  await expect(page.getByRole("heading", { name: "Ta bibliothèque", exact: true })).toHaveCount(0);
  const contenu = await domRendu(page);
  expect(contenu).not.toContain("Te voilà");
  expect(contenu).not.toContain("Cet espace n’est visible que par toi");

  // La destination est conservée, et c'est bien un chemin RELATIF autorisé.
  const destination = new URL(page.url()).searchParams.get("destination");
  expect(destination).toBe("/bibliotheque");
});

test("AC 1 — une destination hostile ne survit jamais au rendu de l'écran de connexion", async ({ page }) => {
  for (const hostile of [
    "https://evil.test",
    "//evil.test",
    "\\evil.test",
    "javascript:alert(1)",
    "/administration",
    "",
  ]) {
    await ouvrirConnexion(page, `?destination=${encodeURIComponent(hostile)}`);
    const champCache = page.locator('input[name="destination"]');
    await expect(champCache).toHaveValue("/");
    // La valeur refusée n'est jamais réaffichée dans le DOM rendu : ni en texte, ni en attribut.
    if (hostile.length > 0) expect(await domRendu(page)).not.toContain(hostile);
  }
});

test("AC 1 — un cookie de session falsifié ne vaut pas une session", async ({ page, context, baseURL }) => {
  // On obtient d'abord le VRAI cookie de session, en se connectant. Son nom est calculé par
  // `@supabase/ssr` à partir de l'URL du service : le deviner serait fragile, le récolter ne
  // l'est pas.
  await ouvrirConnexion(page, "?destination=%2Fbibliotheque");
  await soumettre(page, COMPTES.valide.email, COMPTES.valide.password);
  await expect(page).toHaveURL(/\/bibliotheque$/);

  const cookies = await context.cookies(baseURL);
  const session = cookies.filter((cookie) => cookie.name.includes("auth-token"));
  expect(session.length).toBeGreaterThan(0);
  // Le jeton reste hors de portée d'un script injecté : c'est ce que `httpOnly` garantit, et
  // c'est la différence entre cette implémentation et un client d'authentification navigateur.
  for (const cookie of session) expect(cookie.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");

  // Falsification : on altère la charge du jeton. Le serveur d'authentification ne le
  // reconnaît plus — `getUser()` le lui demande, `getSession()` ne l'aurait pas fait.
  await context.clearCookies();
  await context.addCookies(
    session.map((cookie) => ({ ...cookie, value: cookie.value.replace(/.$/, "X") })),
  );

  await page.goto("/bibliotheque");
  await expect(page).toHaveURL(/\/connexion\?destination=%2Fbibliotheque$/);
  await expect(page.locator(IDENTIFIANTS.email)).toBeVisible();
  expect(await domRendu(page)).not.toContain("Te voilà");
});

// ── AC 3 — saisie conservée, erreur reliée, focus selon le nombre d'erreurs ───────────────

test("AC 3 — deux erreurs de validation : le résumé est focalisé et porte un lien par champ", async ({ page }) => {
  await ouvrirConnexion(page);
  await page.getByRole("button", { name: /connecter/i }).click();

  const resume = page.locator(IDENTIFIANTS.resume);
  await expect(resume).toBeVisible();
  await expect(resume).toBeFocused();
  await expect(resume.getByRole("link")).toHaveCount(2);

  // Chaque lien du résumé mène au champ correspondant, et le message y est identique.
  const messageEmail = await page.locator(IDENTIFIANTS.erreurEmail).innerText();
  await expect(resume.getByRole("link").first()).toHaveAttribute("href", "#champ-email");
  expect((await resume.getByRole("link").first().innerText()).trim()).toContain(messageEmail.trim());

  await expect(page.locator(IDENTIFIANTS.email)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toHaveAttribute("aria-invalid", "true");
});

test("AC 3 — une seule erreur : le focus va sur le champ, jamais sur un résumé", async ({ page }) => {
  await ouvrirConnexion(page);
  await soumettre(page, COMPTES.valide.email, "");

  const motDePasse = page.locator(IDENTIFIANTS.motDePasse);
  await expect(motDePasse).toBeFocused();
  await expect(page.locator(IDENTIFIANTS.resume)).toHaveCount(0);
  await expect(motDePasse).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(IDENTIFIANTS.email)).toHaveAttribute("aria-invalid", "false");

  // Liaison erreur↔champ : le message est référencé par `aria-describedby`, pas seulement voisin.
  const decritPar = (await motDePasse.getAttribute("aria-describedby")) ?? "";
  expect(decritPar.split(/\s+/)).toContain("erreur-mot-de-passe");

  // La saisie de l'e-mail est CONSERVÉE : c'est l'exigence explicite de l'AC 3.
  await expect(page.locator(IDENTIFIANTS.email)).toHaveValue(COMPTES.valide.email);
});

test("AC 3 — refus d'identifiants : UNE erreur, deux champs marqués, focus sur l'e-mail", async ({ page }) => {
  await ouvrirConnexion(page);
  await soumettre(page, COMPTES.valide.email, COMPTES.mauvaisMotDePasse);

  const message = page.locator(IDENTIFIANTS.erreurIdentifiants);
  await expect(message).toBeVisible();

  // UNE erreur : le résumé « deux erreurs ou plus » ne s'ouvre pas, et le focus va sur l'e-mail.
  await expect(page.locator(IDENTIFIANTS.resume)).toHaveCount(0);
  await expect(page.locator(IDENTIFIANTS.email)).toBeFocused();

  // Deux champs marqués, un seul message, relié aux DEUX.
  await expect(page.locator(IDENTIFIANTS.email)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toHaveAttribute("aria-invalid", "true");
  for (const selecteur of [IDENTIFIANTS.email, IDENTIFIANTS.motDePasse]) {
    const decritPar = (await page.locator(selecteur).getAttribute("aria-describedby")) ?? "";
    expect(decritPar.split(/\s+/)).toContain("erreur-identifiants");
  }

  // Le message ne nomme aucun des deux champs : pas d'oracle d'énumération de comptes.
  const texte = await message.innerText();
  expect(texte.toLowerCase()).not.toMatch(/inconnu|inexistant|introuvable|incorrect/);

  // Les deux saisies sont conservées, mot de passe compris.
  await expect(page.locator(IDENTIFIANTS.email)).toHaveValue(COMPTES.valide.email);
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toHaveValue(COMPTES.mauvaisMotDePasse);

  // Jamais la couleur seule : une icône ET du texte accompagnent le message.
  await expect(message.locator("svg")).toHaveCount(1);
  expect(texte.trim().length).toBeGreaterThan(20);
});

test("AC 3 — panne du service : alerte distincte, saisie conservée, focus rendu au bouton", async ({ page }) => {
  await ouvrirConnexion(page);
  await soumettre(page, COMPTES.emailEnPanne, COMPTES.valide.password);

  const alerte = page.locator(IDENTIFIANTS.alerteReseau);
  await expect(alerte).toBeVisible();
  await expect(alerte).toHaveAttribute("role", "alert");

  // Une panne n'est PAS un refus : elle ne marque aucun champ et n'accuse pas les identifiants.
  await expect(page.locator(IDENTIFIANTS.erreurIdentifiants)).toHaveCount(0);
  await expect(page.locator(IDENTIFIANTS.email)).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("button", { name: /connecter/i })).toBeFocused();
  await expect(page.locator(IDENTIFIANTS.email)).toHaveValue(COMPTES.emailEnPanne);
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toHaveValue(COMPTES.valide.password);
});

test("AC 3 — deux échecs de suite redéplacent le focus", async ({ page }) => {
  await ouvrirConnexion(page);
  await soumettre(page, COMPTES.valide.email, COMPTES.mauvaisMotDePasse);
  await expect(page.locator(IDENTIFIANTS.email)).toBeFocused();

  // On déplace le focus ailleurs, puis on rejoue le MÊME échec : l'état serait identique sans
  // le compteur de tentatives, et le focus ne bougerait pas.
  await page.locator(IDENTIFIANTS.motDePasse).focus();
  await page.getByRole("button", { name: /connecter/i }).click();
  await expect(page.locator(IDENTIFIANTS.email)).toBeFocused();
});

// ── Accessibilité chiffrée — sur les quatre projets ──────────────────────────────────────

test("l'écran de connexion ne présente aucune violation WCAG A/AA automatisable", async ({ page }) => {
  await ouvrirConnexion(page);
  const nominal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(nominal.violations).toEqual([]);

  // L'état d'ERREUR est audité lui aussi : c'est là que se concentrent les liaisons ARIA, et
  // un écran nominal conforme ne dit rien de l'écran que l'utilisateur voit après un échec.
  await page.getByRole("button", { name: /connecter/i }).click();
  await expect(page.locator(IDENTIFIANTS.resume)).toBeVisible();
  const enErreur = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(enErreur.violations).toEqual([]);
});

/**
 * Amène le focus sur le champ e-mail PAR LE CLAVIER, puis relève l'indicateur.
 *
 * ⚠️ Deux pièges, mesurés tous les deux :
 *   1. `:focus-visible` ne se déclenche pas sur un `focus()` programmatique dans les contextes
 *      émulés mobiles (`isMobile`/`hasTouch`), c'est-à-dire sur DEUX des quatre projets. Un
 *      test qui se contenterait de `locator.focus()` conclurait « pas de focus visible » sur
 *      tablette alors que le clavier, lui, l'affiche parfaitement. On déplace donc le focus
 *      comme un utilisateur : `Shift+Tab` depuis le mot de passe.
 *   2. Le relevé se fait dans le MÊME `evaluate` que la lecture du fond : deux allers-retours
 *      laissent à React le temps de re-rendre le champ, et le nœud mesuré n'est alors plus
 *      celui qui porte le focus.
 */
const releverFocusClavier = async (page: Page) => {
  await page.locator(IDENTIFIANTS.motDePasse).focus();
  await page.keyboard.press("Shift+Tab");
  return page.locator(IDENTIFIANTS.email).evaluate((element) => {
    const style = getComputedStyle(element);
    // Le contour est décalé de 2px : il repose sur le fond du PANNEAU, pas sur celui du champ.
    const panneau = element.closest("section") ?? document.body;
    return {
      focalise: document.activeElement === element,
      style: style.outlineStyle,
      largeur: Number.parseFloat(style.outlineWidth),
      couleur: style.outlineColor,
      fond: getComputedStyle(panneau).backgroundColor,
    };
  });
};

test("le focus est visible à 3:1 et la cible respecte le plancher de la branche", async ({ page }, testInfo) => {
  await ouvrirConnexion(page);

  const focus = await releverFocusClavier(page);
  expect(focus.focalise).toBe(true);
  expect(focus.style).toBe("solid");
  expect(focus.largeur).toBeGreaterThanOrEqual(2);
  expect(contraste(focus.couleur, focus.fond)).toBeGreaterThanOrEqual(3);

  // Cibles : 44px au pointeur, 48px au tactile. La branche tactile est réellement tactile
  // depuis la réparation de `tablet-keyboard-landscape`.
  const plancher = testInfo.project.use.hasTouch ? 48 : 44;
  for (const selecteur of [IDENTIFIANTS.email, IDENTIFIANTS.motDePasse]) {
    const boite = await page.locator(selecteur).boundingBox();
    expect(boite).not.toBeNull();
    expect(boite!.height).toBeGreaterThanOrEqual(plancher);
  }
  const bouton = await page.getByRole("button", { name: /connecter/i }).boundingBox();
  expect(bouton!.height).toBeGreaterThanOrEqual(plancher);
});

/** Débordement horizontal du document, mesuré à un instant où la page est réellement rendue. */
const debordementHorizontal = (page: Page) =>
  page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

/**
 * Espacement de texte prescrit par WCAG 1.4.12, à la lettre : interligne 1,5 fois la taille,
 * espacement des lettres 0,12em, des mots 0,16em, et 2em entre paragraphes.
 */
const ESPACEMENT_1_4_12 =
  "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }" +
  " p, label { margin-bottom: 2em !important; }";

/**
 * Zoom 200 %, émulé en DIVISANT LE VIEWPORT PAR DEUX — et non par `document.body.style.zoom`.
 *
 * ⚠️ Les deux ne sont pas équivalents, et la différence est mesurable ici.
 *
 * Un zoom navigateur à 200 % divise par deux le nombre de pixels CSS de la fenêtre de mise en
 * page : une fenêtre de 768 px devient un viewport de 384 px, et les unités `vw` — donc tous
 * les `clamp(…, Nvw, …)` de `globals.css` — se recalculent sur cette nouvelle largeur.
 * `body { zoom: 2 }`, lui, agrandit le contenu SANS toucher au viewport : `vw` continue de
 * valoir 1 % de 768 px. Les tailles fluides ne rétrécissent donc pas, et le titre en
 * `clamp(2.25rem, 8vw, 3.5rem)` reste plafonné à 56 px dans une zone deux fois plus étroite.
 *
 * Mesuré : sur `tablet-touch-portrait` (768 px), l'approximation par `body { zoom }` fait
 * déborder le document de 100 px, le mot insécable « bibliothèque » du titre dépassant à lui
 * seul la largeur disponible. Sous un vrai zoom à 200 %, le même titre est calculé à 36 px et
 * tout tient. Le débordement était donc un artefact de la méthode de mesure, pas un défaut de
 * la page — et l'assertion qui s'y appuyait aurait accusé le produit à tort.
 */
test("le zoom 200 % laisse le formulaire utilisable sans défilement bidimensionnel", async ({ page }, testInfo) => {
  const viewport = testInfo.project.use.viewport;
  expect(viewport).toBeTruthy();
  await page.setViewportSize({
    width: Math.round(viewport!.width / 2),
    height: Math.round(viewport!.height / 2),
  });

  await ouvrirConnexion(page);
  const dimensions = await debordementHorizontal(page);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expect(page.locator(IDENTIFIANTS.email)).toBeVisible();
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toBeVisible();
  await expect(page.getByRole("button", { name: /connecter/i })).toBeVisible();
});

test("le reflow 400 % à 320 CSS px ne produit aucun défilement bidimensionnel", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ouvrirConnexion(page);

  const dimensions = await debordementHorizontal(page);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);

  // Rien n'est perdu au passage : les deux champs et la commande restent atteignables.
  await expect(page.locator(IDENTIFIANTS.email)).toBeVisible();
  await expect(page.locator(IDENTIFIANTS.motDePasse)).toBeVisible();
  await expect(page.getByRole("button", { name: /connecter/i })).toBeVisible();
});

/**
 * ⚠️ Reflow et espacement sont vérifiés SÉPARÉMENT, et c'est délibéré.
 *
 * WCAG 1.4.10 exige l'absence de défilement bidimensionnel à 320 CSS px ; WCAG 1.4.12 exige
 * qu'aucun contenu ni aucune fonction ne se perde quand l'utilisateur impose son espacement.
 * Ni l'un ni l'autre n'exige la conjonction des deux, et les mesurer ensemble reviendrait à
 * inventer un critère plus strict que la norme.
 *
 * Cette distinction n'est pas théorique : mesuré sur cet écran, le cumul des deux contraintes
 * fait déborder le panneau de 2 px à 320 px, le mot « bibliothèque » du titre en Lora 36 px
 * augmenté de 0,12em d'interlettrage dépassant à lui seul la largeur disponible. Un titre est
 * insécable ; il n'y a rien à y couper. Ce constat est signalé plutôt que masqué — et plutôt
 * que gravé dans une assertion qui exigerait de la page plus que le plancher WCAG 2.2 AA.
 */
test("l'espacement de texte WCAG 1.4.12 ne perd ni contenu ni lisibilité", async ({ page }) => {
  await ouvrirConnexion(page);
  await page.addStyleTag({ content: ESPACEMENT_1_4_12 });

  const dimensions = await debordementHorizontal(page);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);

  // Ni perte de contenu, ni chevauchement : chaque étiquette reste au-dessus de son champ, et
  // chaque message d'aide au-dessous, sans qu'aucune boîte n'en recouvre une autre.
  for (const [etiquette, champ, aide] of [
    ["Ton adresse e-mail", IDENTIFIANTS.email, "#aide-email"],
    ["Ton mot de passe", IDENTIFIANTS.motDePasse, "#aide-mot-de-passe"],
  ] as const) {
    const boiteEtiquette = await page.getByText(etiquette, { exact: true }).boundingBox();
    const boiteChamp = await page.locator(champ).boundingBox();
    const boiteAide = await page.locator(aide).boundingBox();
    expect(boiteEtiquette).not.toBeNull();
    expect(boiteChamp).not.toBeNull();
    expect(boiteAide).not.toBeNull();
    expect(boiteEtiquette!.y + boiteEtiquette!.height).toBeLessThanOrEqual(boiteChamp!.y + 1);
    expect(boiteChamp!.y + boiteChamp!.height).toBeLessThanOrEqual(boiteAide!.y + 1);
  }
  await expect(page.getByRole("button", { name: /connecter/i })).toBeVisible();
});

test("le thème sombre conserve un focus visible à 3:1", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ouvrirConnexion(page);

  const focus = await releverFocusClavier(page);
  expect(focus.focalise).toBe(true);
  expect(focus.style).toBe("solid");
  expect(contraste(focus.couleur, focus.fond)).toBeGreaterThanOrEqual(3);
});
