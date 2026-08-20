import { Construction } from "lucide-react";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Construction className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-foreground">{title}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Bu modül yakında kullanıma açılacak.
        </p>
      </div>
    </div>
  );
}
