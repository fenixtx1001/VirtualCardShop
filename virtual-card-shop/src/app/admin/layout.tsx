import type { ReactNode } from "react";
import AdminFrame from "./AdminFrame";
import "./admin.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
