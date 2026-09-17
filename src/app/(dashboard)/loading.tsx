export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6" role="status" aria-label="Loading page">
      <div className="h-7 w-52 rounded bg-muted motion-safe:animate-pulse" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-lg border border-border bg-card motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-lg border border-border bg-card motion-safe:animate-pulse" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}
