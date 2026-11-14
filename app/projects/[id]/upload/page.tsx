"use client";
import { use } from "react";
import { ProjectForm } from "@/components/project-form";
import { useProject } from "@/hooks/use-project";

export default function UploadStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate } = useProject(id);
  if (!data) return null;
  return (
    <div className="mx-auto max-w-6xl p-6">
      <ProjectForm key={data.project.updated_at} project={data.project} assets={data.assets} onSaved={() => mutate()} />
    </div>
  );
}
