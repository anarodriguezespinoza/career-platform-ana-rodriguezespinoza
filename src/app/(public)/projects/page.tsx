import { ProjectCard } from "../../../components/public/project-card";
import { SourceStatus } from "../../../components/public/source-status";
import { getPublicContent } from "../../../lib/public/content";
import { metadataFor } from "../../../lib/public/metadata";
export const metadata = metadataFor({ title: "Projects — Ana Rodriguez", description: "Selected projects and experiments by Ana Rodriguez.", path: "/projects" });
export default async function ProjectsPage() { const { content, source } = await getPublicContent(); return <div className="page-shell py-16 sm:py-24"><SourceStatus source={source} /><p className="eyebrow">Projects</p><h1 className="page-title">Selected work, with the context left in.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">A selection of products, platforms, and experiments shaped by curiosity and care.</p><div className="mt-14 grid gap-5 md:grid-cols-2">{content.projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div></div>; }
