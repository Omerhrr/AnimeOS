"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Plus, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { safeJsonParse } from "@/lib/types";

const SUB_LANGS = ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR", "es-ES", "ar-SA"];

function AddTermDialog() {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("TECHNIQUE");
  const [translations, setTranslations] = useState<Record<string, string>>({});

  async function save() {
    setBusy(true);
    try {
      await api.addTerminology({
        projectId,
        term,
        category,
        translations: Object.fromEntries(Object.entries(translations).filter(([, v]) => v.trim())),
      });
      qc.invalidateQueries({ queryKey: ["terminology", projectId] });
      setOpen(false);
      setTerm(""); setTranslations({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Add term</Button>
      </DialogTrigger>
      <DialogContent className="bg-card max-w-md max-h-[80vh] overflow-y-auto studio-scroll">
        <DialogHeader><DialogTitle>Add canonical term</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Term</Label>
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Azure Flame" className="bg-white/5 border-white/12" />
            </div>
            <div className="grid gap-1.5"><Label>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["TECHNIQUE", "CHARACTER_NAME", "LOCATION", "REALM", "ORGANIZATION", "ITEM"].map((c) => (
                  <option key={c} className="bg-card">{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Translations</Label>
            {SUB_LANGS.map((l) => (
              <div key={l} className="grid grid-cols-[70px_1fr] gap-2 items-center">
                <span className="text-[11px] text-muted-foreground">{l}</span>
                <Input
                  value={translations[l] ?? ""}
                  onChange={(e) => setTranslations((prev) => ({ ...prev, [l]: e.target.value }))}
                  className="h-8 bg-white/5 border-white/12 text-sm"
                />
              </div>
            ))}
          </div>
          <Button onClick={save} disabled={busy || !term.trim()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save to memory</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TerminologyView({ project }: { project: import("@/lib/api-client").StudioProject }) {
  const termsQ = useQuery({
    queryKey: ["terminology", project.id],
    queryFn: () => api.fetchTerminology(project.id),
    refetchInterval: 10000,
  });

  const terms = termsQ.data ?? [];
  const langs = ["zh-CN", "en-US", "ja-JP", "ko-KR", "fr-FR"];

  return (
    <div>
      <SectionHeader
        title="Translation Memory"
        sub="Canonical terminology database - keeps names, techniques, realms and locations consistent across hundreds of episodes and every subtitle language."
        right={<AddTermDialog />}
      />
      <div className="studio-panel overflow-x-auto studio-scroll">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Term</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Category</th>
              {langs.map((l) => (
                <th key={l} className="px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => {
              const tr = safeJsonParse<Record<string, string>>(t.translations, {});
              return (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{t.term}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{t.category ?? "-"}</td>
                  {langs.map((l) => (
                    <td key={l} className="px-3 py-2.5">{tr[l] ?? <span className="text-muted-foreground/40">-</span>}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {terms.length === 0 && (
          <p className="text-xs text-muted-foreground p-8 text-center">No terms yet.</p>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
        <Languages className="h-3.5 w-3.5" />
        Example from the vision: Azure Flame → 青焰 (zh) · 蒼炎 (ja) · 창염 (ko)
      </p>
    </div>
  );
}
