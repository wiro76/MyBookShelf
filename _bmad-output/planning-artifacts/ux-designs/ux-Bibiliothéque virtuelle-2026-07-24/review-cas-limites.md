[
  {
    "location": "EXPERIENCE.md:47",
    "trigger_condition": "La dernière position restaurée référence un module supprimé ou devenu vide",
    "guard_snippet": "if (!moduleExists(savedModule)) restore(nearestExistingModule)",
    "potential_consequence": "Reconnexion sur une position inexistante ou un écran vide"
  },
  {
    "location": "EXPERIENCE.md:69",
    "trigger_condition": "Deux ajouts simultanés remplissent le dernier module",
    "guard_snippet": "transaction(() => appendOrCreateSingleNextModule(status))",
    "potential_consequence": "Deux modules surnuméraires ou deux livres au même emplacement"
  },
  {
    "location": "EXPERIENCE.md:69",
    "trigger_condition": "Le retrait vide un module intermédiaire ou final",
    "guard_snippet": "if (moduleEmpty) applyDocumentedModuleRetentionPolicy()",
    "potential_consequence": "Modules vides persistants ou renumérotation imprévisible"
  },
  {
    "location": "EXPERIENCE.md:76",
    "trigger_condition": "Un résultat localisé appartient encore à À ranger",
    "guard_snippet": "if (exemplar.unplaced) openPendingPlacementAndFocus(exemplar)",
    "potential_consequence": "Localisation impossible faute de module et d’Étagère"
  },
  {
    "location": "EXPERIENCE.md:76",
    "trigger_condition": "L’Exemplaire change de position après l’affichage des résultats",
    "guard_snippet": "location = await resolveCurrentLocation(exemplarId)",
    "potential_consequence": "Mauvaise Tranche mise en évidence ou destination introuvable"
  },
  {
    "location": "EXPERIENCE.md:79",
    "trigger_condition": "Corriger l’Édition rencontre une Couverture ou Tranche personnalisée",
    "guard_snippet": "preserveCustomVisualsUnlessUserExplicitlyResetsToEditionDefaults()",
    "potential_consequence": "Personnalisation visuelle écrasée sans consentement"
  },
  {
    "location": "EXPERIENCE.md:80",
    "trigger_condition": "Un membre du groupe transversal se trouve dans À ranger",
    "guard_snippet": "excludeUnplacedMembersAndAnnounce(count) || requirePlacementFirst()",
    "potential_consequence": "Déplacement collectif tente une position inexistante"
  },
  {
    "location": "EXPERIENCE.md:86",
    "trigger_condition": "Retirer un Exemplaire appartenant à des groupes durables",
    "guard_snippet": "onRemoveExemplar(id) detachFromGroupsAndDeleteEmptyGroups()",
    "potential_consequence": "Groupes avec références mortes ou compteurs inexacts"
  },
  {
    "location": "EXPERIENCE.md:86",
    "trigger_condition": "Retirer un Exemplaire ayant une Lecture active",
    "guard_snippet": "confirmRemovalScope({activeReading, personalData, exemplar})",
    "potential_consequence": "Lecture active orpheline ou supprimée implicitement"
  },
  {
    "location": "EXPERIENCE.md:99",
    "trigger_condition": "L’ISBN existe mais Romane veut un second Exemplaire",
    "guard_snippet": "offerAddExemplar(existingEdition) insteadOfOnlyBlockingCreation()",
    "potential_consequence": "Impossible d’enregistrer plusieurs Exemplaires légitimes"
  },
  {
    "location": "EXPERIENCE.md:103-104",
    "trigger_condition": "Une mutation hors ligne précède une modification sur un autre appareil",
    "guard_snippet": "onReconnect detectConflictThenAskKeepLocalOrRemote()",
    "potential_consequence": "Rangement récent écrasé silencieusement"
  },
  {
    "location": "EXPERIENCE.md:112-113",
    "trigger_condition": "La réponse d’achat se perd après le débit serveur",
    "guard_snippet": "retryPurchaseWithStableIdempotencyKeyThenFetchAuthoritativeReceipt()",
    "potential_consequence": "Objet payé absent ou message erroné de non-débit"
  },
  {
    "location": "EXPERIENCE.md:114",
    "trigger_condition": "Romane achète plusieurs fois un objet déjà possédé",
    "guard_snippet": "defineProductMultiplicityThenBlockOrIncrementOwnedQuantityAtomically()",
    "potential_consequence": "Quantité et disponibilité incohérentes"
  },
  {
    "location": "EXPERIENCE.md:125",
    "trigger_condition": "La destination d’un drag se trouve dans un module hors écran",
    "guard_snippet": "provideEdgeNavigationOrRequireVisibleDestinationBeforeDrag()",
    "potential_consequence": "Déplacement direct impossible entre modules éloignés"
  },
  {
    "location": "EXPERIENCE.md:131",
    "trigger_condition": "Un Exemplaire sélectionné est retiré ou déplacé simultanément",
    "guard_snippet": "beforeCommit revalidateSelectionIdsAndAbortAtomicallyOnMismatch()",
    "potential_consequence": "Déplacement partiel ou sélection fantôme"
  },
  {
    "location": "EXPERIENCE.md:135",
    "trigger_condition": "Le geste de défilement commence sur une rangée entièrement occupée",
    "guard_snippet": "distinguishLongPressFromScrollByTimeAndMovementBeforeReservingGesture()",
    "potential_consequence": "Défilement vertical inaccessible depuis la majeure partie du module"
  },
  {
    "location": "EXPERIENCE.md:139",
    "trigger_condition": "Le reflow dépasse l’Étagère mais tient dans le module",
    "guard_snippet": "defineReflowScopeAndPreviewEveryAffectedShelfBeforeCommit()",
    "potential_consequence": "Livres débordants ou réorganisation inattendue d’autres Étagères"
  },
  {
    "location": "EXPERIENCE.md:139",
    "trigger_condition": "Romane annule le remplacement après une destination incompatible",
    "guard_snippet": "onCancelReplacement restoreOriginalObjectAndPosition()",
    "potential_consequence": "Objet original déplacé ou rendu Disponible involontairement"
  },
  {
    "location": "EXPERIENCE.md:172",
    "trigger_condition": "Un Exemplaire change de statut après avoir terminé une Lecture",
    "guard_snippet": "defineStatusTransitionMatrixWithoutReversingCompletedReadingOrCoins()",
    "potential_consequence": "Dates, Lecture, placement et Pièces deviennent contradictoires"
  },
  {
    "location": "EXPERIENCE.md:180",
    "trigger_condition": "Deux appareils sauvegardent simultanément des rangements divergents",
    "guard_snippet": "commitWithVersionCheckThenResolvePositionConflictExplicitly()",
    "potential_consequence": "Dernière sauvegarde écrase un rangement valide"
  },
  {
    "location": "EXPERIENCE.md:197-205",
    "trigger_condition": "Romane soumet deux fois Terminer avant la première réponse",
    "guard_snippet": "lockFinishActionAndReuseStableReadingCompletionId()",
    "potential_consequence": "Lectures terminées dupliquées malgré un crédit unique"
  },
  {
    "location": "EXPERIENCE.md:197",
    "trigger_condition": "La date de fin précède la date de début",
    "guard_snippet": "if (endDate < startDate) rejectWithFieldError()",
    "potential_consequence": "Lecture chronologiquement invalide enregistrée"
  },
  {
    "location": "EXPERIENCE.md:227",
    "trigger_condition": "Une similarité forte est réellement un nouvel ouvrage",
    "guard_snippet": "allowExplicitCreateAnywayAfterReviewingMatches()",
    "potential_consequence": "Œuvre légitime impossible à créer"
  },
  {
    "location": "EXPERIENCE.md:255-259",
    "trigger_condition": "Pages lues négatives, décimales ou supérieures au total",
    "guard_snippet": "validateIntegerPages({min:0,max:totalOrInfinity})",
    "potential_consequence": "Progression incohérente ou pourcentage impossible"
  },
  {
    "location": "EXPERIENCE.md:267-274",
    "trigger_condition": "Le solde change entre confirmation et débit",
    "guard_snippet": "serverTransactionRechecksBalanceAndReturnsCurrentShortfall()",
    "potential_consequence": "Solde négatif ou confirmation d’achat trompeuse"
  },
  {
    "location": "EXPERIENCE.md:284-287",
    "trigger_condition": "Un ornement prévisualisé devient indisponible avant application",
    "guard_snippet": "revalidateEntitlementBeforeApplyAndKeepCurrentStyleOnFailure()",
    "potential_consequence": "Style non possédé appliqué ou aperçu bloqué"
  }
]
