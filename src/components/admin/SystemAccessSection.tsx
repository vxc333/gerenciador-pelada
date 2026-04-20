import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { PageSectionCard } from "@/components/layout/PageLayout";

interface AccessEntry {
  id: string;
  user_id: string;
  display_name: string;
}

interface SystemAccessSectionProps {
  title: string;
  description: string;
  placeholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  emptyLabel: string;
  entries: AccessEntry[];
  onRemove: (id: string) => void;
}

export const SystemAccessSection = ({
  title,
  description,
  placeholder,
  searchValue,
  onSearchChange,
  onSubmit,
  submitLabel,
  emptyLabel,
  entries,
  onRemove,
}: SystemAccessSectionProps) => {
  return (
    <PageSectionCard title={title} description={description}>
      <div className="mb-4 flex gap-2">
        <Input
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          className="border-border bg-secondary"
        />
        <Button onClick={onSubmit} className="gap-2">
          <Plus className="h-4 w-4" /> {submitLabel}
        </Button>
      </div>

      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-2">
              <div>
                <p className="text-sm text-foreground">{entry.display_name}</p>
                <p className="text-xs text-muted-foreground">{entry.user_id}</p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => onRemove(entry.id)} className="gap-1">
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </Button>
            </div>
          ))
        )}
      </div>
    </PageSectionCard>
  );
};
