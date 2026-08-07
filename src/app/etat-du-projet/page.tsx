import type { Metadata } from "next";
import Link from "next/link";
import { projectProgress, projectStatus, type ProjectEpic, type ProjectStoryStatus } from "./project-status";

export const metadata: Metadata = { title: "État du projet — My BookShelf", robots: { index: false, follow: false } };

const epicStatusLabel = { done: "Terminé", "in-progress": "En cours", backlog: "À venir" } as const;
const storyStatusLabel: Record<ProjectStoryStatus, string> = { done: "Terminé", review: "Revue", "in-progress": "En cours", backlog: "À venir" };

function countStories(epic: ProjectEpic) {
  return { done: epic.stories.filter((story) => story.status === "done").length, total: epic.stories.length };
}

function EpicOverview({ epic }: { epic: ProjectEpic }) {
  const counts = countStories(epic);
  return (
    <article className={`project-epic project-epic-${epic.status}`}>
      <div className="project-epic-heading">
        <div><p className="project-kicker">Epic {epic.id}</p><h3>{epic.title}</h3></div>
        <span className={`project-badge project-badge-${epic.status}`}>{epicStatusLabel[epic.status]}</span>
      </div>
      <p>{epic.value}</p>
      {epic.stories.length ? <p className="project-epic-count">{counts.done} / {counts.total} stories terminées ou livrées à la revue</p> : null}
    </article>
  );
}

export default function EtatDuProjetPage() {
  const activeEpic = projectStatus.epics.find((epic) => epic.status === "in-progress")!;
  return (
    <main className="project-shell">
      <header className="project-header">
        <div><p className="eyebrow">My BookShelf · supervision BMAD</p><h1>État du projet</h1><p className="project-lede">Une vue de la roadmap, du sprint actif et des preuves livrées.</p></div>
        <nav className="project-nav" aria-label="Navigation du projet"><Link href="/">Accueil</Link><Link href="/bibliotheque">Bibliothèque</Link><Link className="primary-action" href="/catalogue">Catalogue</Link></nav>
      </header>

      <section className="project-progress-band" aria-labelledby="project-progress-title">
        <div className="project-progress-summary"><div><p className="project-kicker">Progression globale</p><h2 id="project-progress-title">{projectStatus.advancedStories} / {projectStatus.totalStories} stories avancées</h2></div><strong>{projectProgress} %</strong></div>
        <div className="project-progress-track" role="progressbar" aria-label="Progression globale des stories" aria-valuemin={0} aria-valuemax={projectStatus.totalStories} aria-valuenow={projectStatus.advancedStories}><span style={{ width: `${projectProgress}%` }} /></div>
        <p className="project-updated">Dernière mise à jour : {projectStatus.updatedAt}</p>
      </section>

      <section className="project-sprint" aria-labelledby="project-sprint-title">
        <div className="project-section-heading"><div><p className="project-kicker">Sprint actif</p><h2 id="project-sprint-title">{projectStatus.sprint}</h2></div><span className="project-badge project-badge-in-progress">En cours</span></div>
        <dl className="project-focus-grid"><div><dt>Focus actuel</dt><dd>{projectStatus.currentFocus}</dd></div><div><dt>Prochaine étape</dt><dd>{projectStatus.nextFocus}</dd></div></dl>
      </section>

      <section aria-labelledby="project-roadmap-title"><div className="project-section-heading"><div><p className="project-kicker">Roadmap</p><h2 id="project-roadmap-title">Epics</h2></div><span className="project-muted">{projectStatus.epics.length} epics</span></div><div className="project-epic-grid">{projectStatus.epics.map((epic) => <EpicOverview key={epic.id} epic={epic} />)}</div></section>

      <section className="project-stories-section" aria-labelledby="project-stories-title"><div className="project-section-heading"><div><p className="project-kicker">Détail du sprint</p><h2 id="project-stories-title">Stories de l’Epic {activeEpic.id}</h2></div><span className="project-muted">{activeEpic.stories.length} stories</span></div><div className="project-story-list">{activeEpic.stories.map((story) => <div className="project-story-row" key={story.id}><span className="project-story-id">{story.id}</span><span>{story.title}</span><span className={`project-badge project-badge-${story.status}`}>{storyStatusLabel[story.status]}</span></div>)}</div></section>
    </main>
  );
}
