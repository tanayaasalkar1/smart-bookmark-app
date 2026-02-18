"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Bookmark = {
  id: string;
  url: string;
  title: string;
  created_at: string;
  user_id: string;
};

type User = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string };
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false); // ← key fix
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Step 1: check auth FIRST, only redirect after confirmed no session
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // No session found — now it's safe to redirect
        router.push("/");
        return;
      }
      setUser(session.user as User);
      setAuthChecked(true);
      fetchBookmarks(session.user.id);
    };

    checkAuth();

    // Also listen for auth state changes (handles token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/");
      } else {
        setUser(session.user as User);
        setAuthChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Step 2: realtime — only after auth confirmed
  useEffect(() => {
    if (!user) return;

    channelRef.current = supabase
      .channel("bookmarks-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookmarks", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newBookmark = payload.new as Bookmark;
          setBookmarks((prev) => {
            if (prev.find((b) => b.id === newBookmark.id)) return prev;
            return [newBookmark, ...prev];
          });
          setNewIds((prev) => new Set(prev).add(newBookmark.id));
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(newBookmark.id);
              return next;
            });
          }, 1500);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bookmarks" },
        (payload) => {
          setBookmarks((prev) => prev.filter((b) => b.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [user]);

  const fetchBookmarks = async (userId: string) => {
    setBookmarksLoading(true);
    const { data } = await supabase
      .from("bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setBookmarks(data || []);
    setBookmarksLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!url.trim() || !title.trim()) {
      setError("Both URL and title are required.");
      return;
    }
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = "https://" + formattedUrl;
    }
    setAdding(true);
    const { error: insertError } = await supabase.from("bookmarks").insert([
      { url: formattedUrl, title: title.trim(), user_id: user?.id },
    ]);
    if (insertError) {
      setError("Failed to add bookmark. Try again.");
    } else {
      setUrl("");
      setTitle("");
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await supabase.from("bookmarks").delete().eq("id", id);
    setDeletingId(null);
  };

 const handleLogout = async () => {
  try {
    // 1️⃣ Unsubscribe realtime channel
    channelRef.current?.unsubscribe();

    // 2️⃣ Sign out from Supabase (clears auth session)
    await supabase.auth.signOut();

    // 3️⃣ Clear browser storage manually (extra safety)
    localStorage.clear();
    sessionStorage.clear();

    // 4️⃣ Reset local state
    setUser(null);
    setBookmarks([]);
    setNewIds(new Set());

    // 5️⃣ Force redirect to home
    router.replace("/");

  } catch (error) {
    console.error("Logout error:", error);
  }
};


  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  const getDomain = (urlStr: string) => {
    try { return new URL(urlStr).hostname.replace("www.", ""); }
    catch { return urlStr; }
  };

  const avatarLetter = user?.user_metadata?.full_name?.[0] || user?.email?.[0] || "U";

  // ── Show full-screen loader while auth is being checked ──
  if (!authChecked) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#030712",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {/* Logo */}
        <div style={{
          width: "48px", height: "48px", borderRadius: "12px",
          background: "linear-gradient(135deg, #06b6d4, #0891b2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px rgba(6,182,212,0.4)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              stroke="#000" strokeWidth="2" strokeLinejoin="round" fill="#000" />
          </svg>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: "#06b6d4",
              animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.95)} }
          @keyframes bounce { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-8px);opacity:1} }
        `}</style>
      </div>
    );
  }

  // ── Main Dashboard ──
  return (
    <div style={{
      minHeight: "100vh",
      background: "#030712",
      backgroundImage: `
        linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)
      `,
      backgroundSize: "40px 40px",
      fontFamily: "'Space Grotesk', sans-serif",
      color: "#f0f9ff",
    }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", top: "-15%", right: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "-15%", left: "-10%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(3, 7, 18, 0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(6, 182, 212, 0.1)",
        padding: "0 24px",
      }}>
        <div style={{
          maxWidth: "860px", margin: "0 auto", height: "64px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "9px",
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 14px rgba(6,182,212,0.35)", flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke="#000" strokeWidth="2" strokeLinejoin="round" fill="#000" />
              </svg>
            </div>
            <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "#f0f9ff", letterSpacing: "-0.01em" }}>SmartMark</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="avatar"
                style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(6,182,212,0.4)" }} />
            ) : (
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.85rem", fontWeight: "700", color: "#000",
              }}>
                {avatarLetter.toUpperCase()}
              </div>
            )}
            <button onClick={handleLogout} style={{
              padding: "7px 16px", borderRadius: "8px",
              border: "1px solid rgba(6, 182, 212, 0.2)",
              background: "transparent", color: "#64748b",
              fontSize: "0.8rem", fontWeight: "500",
              fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer",
              transition: "all 0.2s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#22d3ee"; e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)"; e.currentTarget.style.background = "rgba(6,182,212,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "rgba(6,182,212,0.2)"; e.currentTarget.style.background = "transparent"; }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px", position: "relative", zIndex: 1 }}>

        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#f0f9ff", letterSpacing: "-0.02em", marginBottom: "6px" }}>
            My Bookmarks
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#475569" }}>
            {bookmarks.length} saved {bookmarks.length === 1 ? "link" : "links"} · updates in real-time
          </p>
        </div>

        {/* Add Form */}
        <div style={{
          background: "#0d1526",
          border: "1px solid rgba(6, 182, 212, 0.15)",
          borderRadius: "16px", padding: "28px 32px", marginBottom: "32px",
          boxShadow: "0 0 40px rgba(6,182,212,0.04)",
        }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: "600", color: "#94a3b8", marginBottom: "20px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            + Add New Bookmark
          </h2>
          <form onSubmit={handleAdd}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <label style={{ fontSize: "0.78rem", color: "#475569", fontWeight: "500", letterSpacing: "0.04em" }}>TITLE</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GitHub Dashboard"
                  style={{ padding: "11px 14px", borderRadius: "9px", border: "1px solid rgba(6, 182, 212, 0.15)", background: "rgba(6, 182, 212, 0.04)", color: "#f0f9ff", fontSize: "0.9rem", fontFamily: "'Space Grotesk', sans-serif", outline: "none", transition: "all 0.2s ease" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)"; e.currentTarget.style.background = "rgba(6,182,212,0.07)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(6,182,212,0.08)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.15)"; e.currentTarget.style.background = "rgba(6,182,212,0.04)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <label style={{ fontSize: "0.78rem", color: "#475569", fontWeight: "500", letterSpacing: "0.04em" }}>URL</label>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ padding: "11px 14px", borderRadius: "9px", border: "1px solid rgba(6, 182, 212, 0.15)", background: "rgba(6, 182, 212, 0.04)", color: "#f0f9ff", fontSize: "0.9rem", fontFamily: "'JetBrains Mono', monospace", outline: "none", transition: "all 0.2s ease" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)"; e.currentTarget.style.background = "rgba(6,182,212,0.07)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(6,182,212,0.08)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.15)"; e.currentTarget.style.background = "rgba(6,182,212,0.04)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
            </div>

            {error && <p style={{ fontSize: "0.8rem", color: "#f87171", marginBottom: "12px" }}>⚠ {error}</p>}

            <button type="submit" disabled={adding} style={{
              padding: "11px 28px", borderRadius: "9px", border: "none",
              background: adding ? "rgba(6,182,212,0.3)" : "linear-gradient(135deg, #06b6d4, #0891b2)",
              color: "#000", fontSize: "0.9rem", fontWeight: "700",
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: adding ? "not-allowed" : "pointer", transition: "all 0.2s ease",
              boxShadow: adding ? "none" : "0 0 20px rgba(6,182,212,0.25)",
              display: "flex", alignItems: "center", gap: "8px",
            }}
              onMouseEnter={(e) => { if (!adding) { e.currentTarget.style.boxShadow = "0 0 30px rgba(6,182,212,0.4)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 0 20px rgba(6,182,212,0.25)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {adding ? (
                <><span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />Saving...</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#000" strokeWidth="2.5" strokeLinecap="round" /></svg>Save Bookmark</>
              )}
            </button>
          </form>
        </div>

        {/* Bookmark List */}
        <div>
          {bookmarksLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: "80px", borderRadius: "14px", background: "#0d1526", border: "1px solid rgba(6,182,212,0.08)", opacity: 1 - i * 0.2 }} />
              ))}
            </div>
          ) : bookmarks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 24px", background: "#0d1526", border: "1px dashed rgba(6, 182, 212, 0.15)", borderRadius: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ color: "#475569", fontSize: "0.95rem", marginBottom: "6px", fontWeight: "500" }}>No bookmarks yet</p>
              <p style={{ color: "#2d3f55", fontSize: "0.82rem" }}>Add your first link above to get started</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} style={{
                  background: newIds.has(bookmark.id) ? "rgba(6,182,212,0.07)" : "#0d1526",
                  border: newIds.has(bookmark.id) ? "1px solid rgba(6,182,212,0.4)" : "1px solid rgba(6, 182, 212, 0.1)",
                  borderRadius: "14px", padding: "18px 22px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
                  transition: "all 0.3s ease",
                  opacity: deletingId === bookmark.id ? 0.4 : 1,
                }}
                  onMouseEnter={(e) => { if (!newIds.has(bookmark.id)) { e.currentTarget.style.borderColor = "rgba(6,182,212,0.25)"; e.currentTarget.style.background = "#111d35"; e.currentTarget.style.transform = "translateX(3px)"; } }}
                  onMouseLeave={(e) => { if (!newIds.has(bookmark.id)) { e.currentTarget.style.borderColor = "rgba(6,182,212,0.1)"; e.currentTarget.style.background = "#0d1526"; e.currentTarget.style.transform = "translateX(0)"; } }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`}
                        alt="" width="20" height="20"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <a href={bookmark.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.95rem", fontWeight: "600", color: "#e2e8f0", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "500px", transition: "color 0.2s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#22d3ee")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#e2e8f0")}
                      >
                        {bookmark.title}
                      </a>
                      <span style={{ fontSize: "0.75rem", color: "#334155", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "400px" }}>
                        {getDomain(bookmark.url)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.75rem", color: "#1e3a4a", whiteSpace: "nowrap" }}>
                      {formatDate(bookmark.created_at)}
                    </span>
                    <button onClick={() => handleDelete(bookmark.id)} disabled={deletingId === bookmark.id}
                      style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid transparent", background: "transparent", color: "#334155", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.background = "rgba(248,113,113,0.1)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#334155"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input::placeholder { color: #2d3f55; }
      `}</style>
    </div>
  );
}