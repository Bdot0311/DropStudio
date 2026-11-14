"use client";
import { use } from "react";
import { AnalyzeView } from "@/components/analyze/analyze-view";

export default function AnalyzeStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AnalyzeView id={id} />;
}
