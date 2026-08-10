# Preuves manuelles d'accessibilité

Cette checklist complète axe et Playwright. Elle doit être rejouée pour chaque nouvelle surface interactive.

- [ ] Contraste du texte, des composants et des états de focus mesuré sur le rendu final.
- [ ] Dimensions physiques des cibles confirmées sur ordinateur et tablette réels.
- [ ] Parcours complet au toucher, à la souris et au clavier sans geste ou survol obligatoire.
- [ ] Focus restauré au déclencheur après fermeture de toute couche modale.
- [ ] Nom, rôle, valeur et annonces vérifiés avec un lecteur d'écran.
- [ ] Information compréhensible sans dépendre uniquement de la couleur.
- [ ] Zoom 200 %, reflow 400 %/320 CSS px et espacement WCAG 1.4.12 inspectés visuellement.
- [ ] Mouvements réduits et orientations paysage/portrait vérifiés sur tablette.

Consigner la date, le navigateur, l'appareil, le lecteur d'écran et les écarts dans la pull request.
