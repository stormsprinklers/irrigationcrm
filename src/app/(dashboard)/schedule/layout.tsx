export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">{children}</div>
  );
}
