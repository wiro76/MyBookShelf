export type ProjectStoryStatus = "done" | "review" | "backlog";

export type ProjectEpic = Readonly<{
  id: string;
  title: string;
  value: string;
  status: "done" | "in-progress" | "backlog";
  stories: readonly Readonly<{ id: string; title: string; status: ProjectStoryStatus }>[];
}>;

export const projectStatus = {
  updatedAt: "7 août 2026",
  totalStories: 37,
  advancedStories: 16,
  sprint: "Sprint Epic 3",
  currentFocus: "Story 3.1 · Choisir l’apparence initiale du meuble",
  nextFocus: "Story 3.2 · Parcourir les trois bibliothèques physiques",
  epics: [
    {
      id: "1",
      title: "Accès privé et reprise fiable",
      value: "Zan retrouve sa bibliothèque privée et son contexte confirmé.",
      status: "done",
      stories: [
        { id: "1.1", title: "Configurer le projet initial", status: "done" },
        { id: "1.2", title: "Bloquer une livraison régressive", status: "done" },
        { id: "1.3", title: "Exécuter les traitements différés", status: "done" },
        { id: "1.4", title: "Corréler les incidents sans fuite", status: "done" },
        { id: "1.5", title: "Prouver une restauration complète", status: "done" },
        { id: "1.6", title: "Se connecter à la bibliothèque", status: "done" },
        { id: "1.7", title: "Reprendre le dernier contexte", status: "done" },
        { id: "1.8", title: "Percevoir chaque sauvegarde", status: "done" },
      ],
    },
    {
      id: "2",
      title: "Acquisition bibliographique maîtrisée",
      value: "Zan trouve, choisit et prépare ses premiers exemplaires.",
      status: "done",
      stories: [
        { id: "2.1", title: "Rechercher une œuvre", status: "done" },
        { id: "2.2", title: "Comparer et choisir une édition", status: "done" },
        { id: "2.3", title: "Initialiser le rangement réel", status: "done" },
        { id: "2.4", title: "Ajouter l’édition comme envie de lire", status: "done" },
        { id: "2.5", title: "Préparer une couverture personnelle", status: "done" },
        { id: "2.6", title: "Créer manuellement une édition", status: "done" },
        { id: "2.7", title: "Gouverner publication et révocation", status: "done" },
        { id: "2.8", title: "Collecter les médias révoqués", status: "done" },
      ],
    },
    { id: "3", title: "Bibliothèque physique et personnelle", value: "Contempler et personnaliser une bibliothèque alimentée.", status: "in-progress", stories: [
      { id: "3.1", title: "Choisir l’apparence initiale du meuble", status: "backlog" },
      { id: "3.2", title: "Parcourir les trois bibliothèques physiques", status: "backlog" },
      { id: "3.3", title: "Naviguer au clavier et avec aides techniques", status: "backlog" },
      { id: "3.4", title: "Gérer l’extension des modules", status: "backlog" },
      { id: "3.5", title: "Afficher les visuels indépendants", status: "backlog" },
    ] },
    { id: "4", title: "Organisation et repérage libres", value: "Ranger, regrouper et retrouver sans corruption.", status: "backlog", stories: [] },
    { id: "5", title: "Lectures et récompenses discrètes", value: "Suivre les lectures et les relectures.", status: "backlog", stories: [] },
    { id: "6", title: "Boutique et décoration", value: "Ajouter des objets cosmétiques sans toucher au rangement.", status: "backlog", stories: [] },
  ] satisfies readonly ProjectEpic[],
} as const;

export const projectProgress = Math.round((projectStatus.advancedStories / projectStatus.totalStories) * 100);
