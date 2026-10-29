import Link from "next/link";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/contact";

/** Footer of the public pages (landing, pricing, download). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
        <span>© {new Date().getFullYear()} Piscatio Technologies</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-foreground">
            Fiyatlandırma
          </Link>
          <Link href="/indir" className="hover:text-foreground">
            Masaüstü uygulaması
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <Mail className="size-3.5" /> {CONTACT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
