import Link from "next/link";
import { binderHref, checklistHref } from "@/lib/collection/set-view-links";
import styles from "./SetViewToggle.module.css";

/** Switch between different representations of the SAME product set. */
export default function SetViewToggle({
  productId, productSetId, active, compareMode = false,
}: {
  productId: string;
  productSetId?: string | null;
  active: "checklist" | "binder";
  compareMode?: boolean;
}) {
  return <nav className={styles.switcher} aria-label="Choose a set view">
    <span className={styles.heading}>SET VIEW</span>
    <div className={styles.choices}>
      <Link href={checklistHref(productId, productSetId)}
        aria-current={active === "checklist" ? "page" : undefined}
        className={active === "checklist" ? styles.current : styles.choice}
        title="Browse the full checklist and ownership progress">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3.5" width="16" height="17" rx="2"/>
          <path d="m7.5 9 1.5 1.5 2.6-3M13.5 9h3M7.5 15l1.5 1.5 2.6-3M13.5 15h3"/>
        </svg>
        Checklist
      </Link>
      <Link href={binderHref(productId, productSetId, { open: true })}
        aria-current={active === "binder" ? "page" : undefined}
        className={active === "binder" ? styles.current : styles.choice}
        title={compareMode ? "Open your own card binder for this set" : "Flip through your nine-pocket binder"}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3.5h15v17H5zM2 3.5h3v17H2z"/>
          <path d="M8 6.5h3v4H8zM13 6.5h3v4h-3zM8 13.5h3v4H8zM13 13.5h3v4h-3z"/>
        </svg>
        {compareMode ? "My Binder" : "Binder"}
      </Link>
    </div>
  </nav>;
}
