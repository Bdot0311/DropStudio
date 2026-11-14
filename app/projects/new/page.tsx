import { ProjectForm } from "@/components/project-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">New project</h1>
      <p className="mb-6 text-sm text-muted-foreground">Drop in a finished track. Analysis starts automatically.</p>
      <ProjectForm />
    </div>
  );
}
