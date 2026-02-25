// Standalone layout for admin auth pages — no sidebar, no navbar
export default function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
