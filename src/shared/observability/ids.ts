import { randomFillSync } from "node:crypto";

/**
 * Identifiants de corrélation — story 1.4 (AD-12).
 *
 * Module volontairement autonome : `node:crypto` uniquement, aucun import relatif,
 * aucune lecture d'environnement, rien de construit à l'import.
 */

/**
 * `crypto.randomUUID()` de Node ne produit que de l'UUIDv4. On génère ici un UUIDv7
 * (RFC 9562) : 48 bits d'horodatage puis aléatoire, ce qui rend les identifiants de
 * corrélation triables par date — c'est ce qui permet de reconstituer une chronologie
 * à partir des seuls `requestId` / `jobId` d'un journal.
 *
 * Implémentation reprise telle quelle de `createJobId` (worker d'effets différés,
 * story 1.3) : `workers` importe `shared`, jamais l'inverse.
 */
export function createCorrelationId(nowMs: number = Date.now()): string {
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(nowMs, 0, 6);
  randomFillSync(bytes, 6, 10);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
