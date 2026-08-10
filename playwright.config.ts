import { defineConfig, devices } from "@playwright/test";

/**
 * Matrice d'audit — quatre branches, réellement distinctes.
 *
 * ⚠️ `tablet-keyboard-landscape` était jusqu'à la story 1.6 une COPIE EXACTE de
 * `desktop-keyboard` : `Desktop Chrome`, 1024×768, ni `hasTouch` ni `isMobile`. La branche
 * « tablette clavier » de la matrice n'était donc pas exercée, et les preuves qui s'y
 * rattachaient étaient fausses — elles rejouaient deux fois l'ordinateur. Il repose désormais
 * sur `iPad (gen 7)` en PAYSAGE : le viewport est celui de l'appareil, tourné, et `hasTouch`
 * comme `isMobile` viennent du profil d'appareil. C'est ce qui rend la branche « tablette avec
 * clavier » observable : un appareil tactile piloté au clavier, où le focus doit rester visible
 * alors même que le pointeur peut disparaître.
 */
const IPAD = devices["iPad (gen 7)"];

/**
 * Port du faux service d'authentification. Voir `tests/e2e/faux-service-auth.mjs` : le job
 * `browser` de la CI n'a ni Docker ni Supabase, et démarrer une pile depuis Playwright est
 * explicitement proscrit par la story. Les preuves d'INTERFACE (AC 1 et AC 3) n'ont pourtant
 * besoin que d'un interlocuteur qui réponde 200, 400 ou 503 : la vérité du service — qu'un
 * mot de passe est réellement vérifié, qu'une session est réellement établie, que RLS isole
 * réellement — est prouvée ailleurs, par le canari Node de la porte `database`, contre le vrai
 * GoTrue.
 */
const FAUX_AUTH_PORT = 3101;
const FAUX_CATALOGUE_PORT = 3102;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${process.execPath} tests/e2e/faux-service-auth.mjs`,
      url: `http://127.0.0.1:${FAUX_AUTH_PORT}/sante`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, FAUX_AUTH_PORT: String(FAUX_AUTH_PORT) },
    },
    {
      command: `${process.execPath} tests/e2e/faux-service-catalogue.mjs`,
      url: `http://127.0.0.1:${FAUX_CATALOGUE_PORT}/sante`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, FAUX_CATALOGUE_PORT: String(FAUX_CATALOGUE_PORT) },
    },
    {
      command: `${process.execPath} node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100`,
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...process.env,
        APP_ENV: "local",
        TARGET_FINGERPRINT: "local-mbs-v1",
        ENABLE_E2E_HARNESS: "1",
        SUPABASE_URL: `http://127.0.0.1:${FAUX_AUTH_PORT}`,
        SUPABASE_ANON_KEY: "local-test-only-anon-key",
        CATALOG_GOOGLE_BOOKS_BASE_URL: `http://127.0.0.1:${FAUX_CATALOGUE_PORT}`,
        CATALOG_OPEN_LIBRARY_BASE_URL: `http://127.0.0.1:${FAUX_CATALOGUE_PORT}`,
        CATALOG_BNF_BASE_URL: `http://127.0.0.1:${FAUX_CATALOGUE_PORT}`,
      },
    },
  ],
  projects: [
    {
      name: "desktop-mouse",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-keyboard",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "tablet-touch-portrait",
      use: { ...devices["iPad (gen 7)"], browserName: "chromium", viewport: { width: 768, height: 1024 } },
    },
    {
      name: "tablet-keyboard-landscape",
      use: {
        ...IPAD,
        browserName: "chromium",
        // Paysage : les dimensions du profil d'appareil, permutées, jamais retapées à la main.
        viewport: { width: IPAD.viewport.height, height: IPAD.viewport.width },
      },
    },
  ],
});
