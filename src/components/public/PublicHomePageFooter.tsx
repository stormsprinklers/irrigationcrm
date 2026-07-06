import Link from "next/link";

export function PublicHomePageFooter() {
  return (
    <footer className="border-t border-storm-ice/60 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Storm Sprinklers LLC · Irrigation CRM</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          <a
            href="https://www.stormsprinklers.com"
            className="underline hover:text-foreground"
            rel="noopener noreferrer"
          >
            stormsprinklers.com
          </a>
          <a
            href="https://www.stormsprinklers.com/contact"
            className="underline hover:text-foreground"
            rel="noopener noreferrer"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
