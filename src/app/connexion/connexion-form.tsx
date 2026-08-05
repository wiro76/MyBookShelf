"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AUTH_ERRORS,
  AUTH_FIELDS,
  AUTH_LABELS,
  type AuthField,
  errorSummaryTitle,
} from "@/modules/identity/application/messages";
import { connexionAction } from "./actions";
import { CONNEXION_INITIAL_STATE } from "./state";

/**
 * Formulaire de connexion — story 1.6 (AC 1, AC 3 ; CAP-11, `EXPERIENCE.md`).
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * RÈGLE DE FOCUS, prescrite par `EXPERIENCE.md`
 * ────────────────────────────────────────────────────────────────────────────────
 *   - **une** erreur de validation → focus sur le champ invalide ;
 *   - **deux ou plus** → focus sur un résumé portant un lien vers chaque champ ;
 *   - **refus d'identifiants** → c'est UNE erreur : `aria-invalid` sur les deux champs, un
 *     seul message relié aux deux, focus sur l'e-mail. Le résumé ne s'ouvre pas : il n'y a pas
 *     deux erreurs, il y en a une qui concerne deux champs. C'est la nuance que la décision
 *     tranchée de la story fixe explicitement.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES CHAMPS CONTRÔLÉS
 * ────────────────────────────────────────────────────────────────────────────────
 * « Conserver toutes les saisies » n'est pas gratuit : React 19 RÉINITIALISE un formulaire
 * non contrôlé après l'exécution d'une action. Un `defaultValue` renvoyé par le serveur
 * réglerait le cas de l'e-mail, mais imposerait de faire repartir le MOT DE PASSE vers le
 * navigateur dans la charge de réponse, puis de le réimprimer dans l'attribut `value` du
 * HTML. On garde donc les deux valeurs dans l'état React : elles ne quittent jamais l'onglet,
 * et la réinitialisation de React n'a rien à réinitialiser.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * ANNONCES
 * ────────────────────────────────────────────────────────────────────────────────
 * Le résumé n'est PAS un `role="alert"` : il reçoit le focus, ce qui suffit à le faire
 * annoncer. Cumuler les deux le ferait lire deux fois — `EXPERIENCE.md` demande une annonce
 * immédiate « sans répétition ». L'alerte réseau, elle, porte `role="alert"` et ne reçoit
 * PAS le focus : le focus reste sur le bouton, c'est-à-dire sur la commande à réessayer.
 * Les messages de champ sont reliés par `aria-describedby` et annoncés avec le champ.
 */

const IDS = {
  email: "champ-email",
  emailHint: "aide-email",
  emailError: "erreur-email",
  password: "champ-mot-de-passe",
  passwordHint: "aide-mot-de-passe",
  passwordError: "erreur-mot-de-passe",
  credentials: "erreur-identifiants",
  summary: "resume-erreurs",
  summaryTitle: "resume-erreurs-titre",
  networkAlert: "alerte-reseau",
} as const;

const FIELD_LABELS: Record<AuthField, string> = {
  email: AUTH_LABELS.emailLabel,
  password: AUTH_LABELS.passwordLabel,
};

const FIELD_IDS: Record<AuthField, string> = {
  email: IDS.email,
  password: IDS.password,
};

/**
 * Icône d'erreur. `EXPERIENCE.md` et CAP-11 interdisent la couleur seule : chaque message
 * porte une couleur, CETTE icône, ET son texte. Elle est `aria-hidden` — le texte adjacent
 * dit déjà tout, et une icône nommée le répéterait à chaque lecture.
 */
function ErrorIcon() {
  return (
    <svg className="auth-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 5.25v6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="14.4" r="1.15" fill="currentColor" />
    </svg>
  );
}

function FieldMessage({ id, children }: { id: string; children: string }) {
  return (
    <p className="auth-message auth-message-error" id={id}>
      <ErrorIcon />
      <span>{children}</span>
    </p>
  );
}

export function ConnexionForm({ destination }: { destination: string }) {
  const [state, formAction, isPending] = useActionState(connexionAction, CONNEXION_INITIAL_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const handledAttempt = useRef(0);

  const invalidFields = AUTH_FIELDS.filter((field) => Boolean(state.fieldErrors[field]));
  const showSummary = invalidFields.length >= 2;

  useEffect(() => {
    // `attempt` garantit que deux échecs identiques redéplacent bien le focus : sans lui, le
    // second échec produirait un état égal au premier et l'effet ne se rejouerait pas.
    if (state.attempt === 0 || state.attempt === handledAttempt.current) return;
    handledAttempt.current = state.attempt;

    // Recalculé ICI plutôt que repris du rendu : un tableau reconstruit à chaque rendu
    // relancerait cet effet à chaque rendu.
    const enDefaut = AUTH_FIELDS.filter((field) => Boolean(state.fieldErrors[field]));

    if (enDefaut.length >= 2) {
      summaryRef.current?.focus();
      return;
    }
    if (enDefaut.length === 1) {
      (enDefaut[0] === "email" ? emailRef : passwordRef).current?.focus();
      return;
    }
    if (state.credentialsRefused) {
      // Une erreur, deux champs marqués, focus sur le premier des deux.
      emailRef.current?.focus();
      return;
    }
    if (state.serviceUnavailable) {
      // L'alerte porte `role="alert"` : elle est annoncée d'elle-même, et la focaliser en plus
      // la ferait lire deux fois. Le focus est RENDU au bouton — c'est la commande à
      // réessayer, et c'est là qu'il était avant la soumission. Sans ce rappel, il serait
      // perdu au profit de `<body>` : désactiver le bouton pendant l'attente le fait
      // défocaliser par le navigateur, et le réactiver ne le ramène pas.
      submitRef.current?.focus();
    }
  }, [state]);

  const emailDescribedBy = [
    IDS.emailHint,
    state.fieldErrors.email ? IDS.emailError : null,
    state.credentialsRefused ? IDS.credentials : null,
  ]
    .filter((value) => value !== null)
    .join(" ");

  const passwordDescribedBy = [
    IDS.passwordHint,
    state.fieldErrors.password ? IDS.passwordError : null,
    state.credentialsRefused ? IDS.credentials : null,
  ]
    .filter((value) => value !== null)
    .join(" ");

  const emailInvalid = Boolean(state.fieldErrors.email) || state.credentialsRefused;
  const passwordInvalid = Boolean(state.fieldErrors.password) || state.credentialsRefused;

  return (
    <>
      {state.serviceUnavailable ? (
        <div className="auth-notice" id={IDS.networkAlert} role="alert">
          <ErrorIcon />
          <p className="auth-notice-text">{AUTH_ERRORS.serviceUnavailable}</p>
        </div>
      ) : null}

      {showSummary ? (
        <div
          className="auth-notice auth-summary"
          id={IDS.summary}
          ref={summaryRef}
          tabIndex={-1}
          aria-labelledby={IDS.summaryTitle}
        >
          <ErrorIcon />
          <div>
            <h2 className="auth-summary-title" id={IDS.summaryTitle}>
              {errorSummaryTitle(invalidFields.length)}
            </h2>
            <ul className="auth-summary-list">
              {invalidFields.map((field) => (
                <li key={field}>
                  <a href={`#${FIELD_IDS[field]}`}>
                    {FIELD_LABELS[field]} — {state.fieldErrors[field]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <form className="auth-form" action={formAction} noValidate>
        {/* Revalidée côté serveur à la soumission : ce champ est envoyé par le client. */}
        <input type="hidden" name="destination" value={destination} />

        <div className="auth-field">
          <label className="auth-label" htmlFor={IDS.email}>
            {AUTH_LABELS.emailLabel}
          </label>
          <input
            className="auth-input"
            id={IDS.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            ref={emailRef}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailInvalid}
            aria-describedby={emailDescribedBy}
          />
          <p className="auth-hint" id={IDS.emailHint}>
            {AUTH_LABELS.emailHint}
          </p>
          {state.fieldErrors.email ? (
            <FieldMessage id={IDS.emailError}>{state.fieldErrors.email}</FieldMessage>
          ) : null}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor={IDS.password}>
            {AUTH_LABELS.passwordLabel}
          </label>
          <input
            className="auth-input"
            id={IDS.password}
            name="password"
            type="password"
            autoComplete="current-password"
            ref={passwordRef}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordInvalid}
            aria-describedby={passwordDescribedBy}
          />
          <p className="auth-hint" id={IDS.passwordHint}>
            {AUTH_LABELS.passwordHint}
          </p>
          {state.fieldErrors.password ? (
            <FieldMessage id={IDS.passwordError}>{state.fieldErrors.password}</FieldMessage>
          ) : null}
        </div>

        {/* Message UNIQUE de refus, relié aux DEUX champs. Il ne nomme jamais lequel des deux
            est en cause — ce serait l'oracle d'énumération que la story interdit. */}
        {state.credentialsRefused ? (
          <FieldMessage id={IDS.credentials}>{AUTH_ERRORS.credentialsRefused}</FieldMessage>
        ) : null}

        <button className="auth-submit" type="submit" ref={submitRef} disabled={isPending}>
          {isPending ? AUTH_LABELS.submitPending : AUTH_LABELS.submit}
        </button>

        {/* Région live polie, présente dès le premier rendu : une région insérée en même temps
            que son contenu n'est pas annoncée. */}
        <p className="auth-status" role="status" aria-live="polite">
          {isPending ? AUTH_LABELS.pendingStatus : ""}
        </p>
      </form>
    </>
  );
}
