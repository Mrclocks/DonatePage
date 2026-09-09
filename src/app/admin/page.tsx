import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
import { isAdminAuthenticated } from "@/lib/auth";
import { adminUrl } from "@/lib/admin-path";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect(adminUrl("/login"));
  }

  return <AdminPanel />;
}
