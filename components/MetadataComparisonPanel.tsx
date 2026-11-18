"use client";

import { Button } from "@/components/ui/button";
import type { MetadataComparison } from "@/utils/metadataComparison";
import { CheckCircle2, Eye, EyeOff, Info, Loader2, ShieldAlert } from "lucide-react";

export default function MetadataComparisonPanel({ comparison, loading, onCompare }: { comparison?: MetadataComparison; loading?: boolean; onCompare: () => void }) {
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Inspecting both files locally…</div>;
  }

  if (!comparison) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onCompare}>
        <Eye className="mr-2 size-4" /> Compare metadata
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/70 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Before vs after</p>
          <p className="text-xs text-muted-foreground">Detected fields only · runs in your browser · no upload</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-4" /> Removed</div>
          <p className="mt-1 text-2xl font-semibold">{comparison.removedFields.length}</p>
          <p className="text-xs text-muted-foreground">detected in original, absent after processing</p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300"><EyeOff className="size-4" /> Still present</div>
          <p className="mt-1 text-2xl font-semibold">{comparison.preservedFields.length}</p>
          <p className="text-xs text-muted-foreground">detected in both files, usually technical data</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
          <div className="flex items-center gap-2 font-medium"><Info className="size-4" /> Original detected</div>
          <p className="mt-1 text-2xl font-semibold">{comparison.detectedOriginalFields.length}</p>
          <p className="text-xs text-muted-foreground">fields inspected for {comparison.format}</p>
        </div>
      </div>

      {comparison.removedFields.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 font-medium">Removed fields</p>
          <div className="flex flex-wrap gap-2">
            {comparison.removedFields.map((field) => <span key={field.name} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{field.name}</span>)}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 rounded-md border border-border p-3 text-muted-foreground"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>No removable field was detected by the browser reader. This is not proof that the file contains no hidden metadata.</span></div>
      )}

      {comparison.preservedFields.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Still present: {comparison.preservedFields.map((field) => field.name).join(", ")}</p>}
      <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground"><strong>Scope:</strong> {comparison.limitations.join(" ")} This comparison is evidence of detected/targeted differences, not a guarantee that every possible hidden value has been removed.</div>
    </div>
  );
}
