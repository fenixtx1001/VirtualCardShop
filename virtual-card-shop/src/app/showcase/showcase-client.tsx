"use client";

// src/app/showcase/showcase-client.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

function formatUserLabel(u: UserOption) {
  const name = (u.name ?? "").trim();
  return name ? name : u.email;
}

export default function ShowcaseClient() {
  // Empty string = Me (same convention you use elsewhere)
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);

  const [err, setErr] = useState<string | null>(null);

  async function loadUsers() {
    setUsersLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const raw = await res.text();

      let j: any = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Users returned non-JSON (${res.status}): ${raw.slice(0, 140)}`);
      }

      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);

      const list = (j?.users ?? []) as UserOption[];
      setUsers(list);
    } catch (e: any) {
      setUsers([]);
      setErr(e?.message ?? "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const selectedUserLabel = useMemo(() => {
    if (!selectedUserId) return "Me";
    const u = users.find((x) => x.id === selectedUserId);
    return u ? formatUserLabel(u) : "Selected user";
  }, [selectedUserId, users]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "underline", fontWeight: 800 }}>
          ← Home
        </Link>

        <div style={{ fontWeight: 900, fontSize: 26 }}>Showcase</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Viewing:</div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 10,
              minWidth: 240,
              fontWeight: 800,
            }}
          >
            <option value="">Me</option>
            {usersLoading
              ? null
              : users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {formatUserLabel(u)}
                  </option>
                ))}
          </select>

          <button onClick={loadUsers} style={{ padding: "8px 10px" }}>
            Refresh Users
          </button>
        </div>
      </div>

      <hr style={{ margin: "14px 0" }} />

      {err ? (
        <div style={{ marginBottom: 12, padding: 10, background: "#fee", border: "1px solid #f99", borderRadius: 10 }}>
          {err}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 14,
          padding: 14,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
          Coming soon for: {selectedUserLabel}
        </div>

        <div style={{ color: "#555", lineHeight: 1.35 }}>
          This page will be your trophy room:
          <ul style={{ marginTop: 10, marginBottom: 0 }}>
            <li>Completed base sets (and % complete for others)</li>
            <li>Awards / badges for milestones</li>
            <li>Insert sets progress</li>
            <li>Most valuable cards</li>
            <li>Starred “favorite” cards</li>
            <li>Leaderboards (collection value, cards owned, sets completed, etc.)</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Leaderboards</div>
          <div style={{ color: "#666" }}>
            Next: add an API endpoint that returns top users by:
            <ul style={{ marginTop: 8 }}>
              <li>Collection value</li>
              <li>Total cards owned</li>
              <li>Sets completed</li>
            </ul>
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Completed Sets</div>
          <div style={{ color: "#666" }}>
            Next: compute “completed” as 100% unique-owned for a product set (base by default).
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Top Cards</div>
          <div style={{ color: "#666" }}>
            Next: show highest book value cards owned by this user (plus favorites once we add starring).
          </div>
        </div>
      </div>
    </div>
  );
}
