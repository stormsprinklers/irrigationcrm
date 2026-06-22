export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-4.5rem-4rem)] w-full overflow-hidden xl:h-[calc(100dvh-4.5rem)]">
      {children}
    </div>
  );
}
