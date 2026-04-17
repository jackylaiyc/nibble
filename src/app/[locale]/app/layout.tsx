import { BottomNav } from "@/components/layout/BottomNav";

/**
 * Layout for the authenticated /app/* routes.
 * Adds the persistent bottom navigation bar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
