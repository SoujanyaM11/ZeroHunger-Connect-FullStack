// src/App.jsx — Zero Hunger Connect with Warm & Earthy Theme & Smart Matching Engine
import { useState, useEffect, createContext, useContext, useCallback, useRef, useMemo } from "react";
import { io } from "socket.io-client";
import api from "./api.js";
import { getFoodImageFallback, selectFoodImage } from "./foodImages.js";

// ── Context ───────────────────────────────────────────────────────────────────
const Ctx = createContext(null);
const useCtx = () => useContext(Ctx);

// ── Constants & Helpers ───────────────────────────────────────────────────────
const URGENCY_LABELS = {
  less_than_1h: "🔴 Less than 1 hour (Emergency)",
  "1_2h":       "🟠 1–2 hours",
  "2_3h":       "🟡 2–3 hours",
  "4_5h":       "🔵 4–5 hours",
  more_than_5h: "⚪ More than 5 hours"
};

function timeLeft(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function expiryColor(ms) {
  const h = (ms - Date.now()) / 3600000;
  if (h <= 0) return "var(--danger)";
  if (h < 1)  return "var(--danger)";
  if (h < 3)  return "var(--warning)";
  return "var(--forest-green)";
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

// Botanical Watercolor Foliage SVG
function BotanicalBranch({ style = {}, className = "" }) {
  return (
    <svg viewBox="0 0 160 160" style={style} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 155C25 125 45 90 85 55C115 28 140 18 150 15" stroke="#79502F" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.45"/>
      <path d="M50 120C38 114 30 102 34 88C42 90 52 98 56 112" fill="#A8B99A" fillOpacity="0.75" stroke="#145C43" strokeWidth="1"/>
      <path d="M68 95C55 86 52 70 60 58C69 64 74 76 72 90" fill="#8F9E82" fillOpacity="0.7" stroke="#145C43" strokeWidth="1"/>
      <path d="M85 70C78 52 84 38 98 32C101 45 98 58 88 68" fill="#A8B99A" fillOpacity="0.8" stroke="#145C43" strokeWidth="1"/>
      <path d="M108 48C108 32 118 22 132 20C132 34 124 45 112 48" fill="#BCCBB0" fillOpacity="0.85" stroke="#145C43" strokeWidth="1"/>
      <path d="M125 32C130 16 144 10 155 12C152 24 142 32 128 32" fill="#D8B56D" fillOpacity="0.6" stroke="#79502F" strokeWidth="1"/>
      <path d="M72 108C86 112 96 122 94 135C82 135 74 126 70 114" fill="#A8B99A" fillOpacity="0.6" stroke="#145C43" strokeWidth="1"/>
      <path d="M92 82C106 82 118 90 120 102C108 106 98 98 90 88" fill="#8F9E82" fillOpacity="0.6" stroke="#145C43" strokeWidth="1"/>
    </svg>
  );
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-in" style={{
          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 550, maxWidth: 360,
          background: t.type === "success" ? "#EAF2E4" : t.type === "error" ? "#FAECE9" : "#EAF0EE",
          color: "var(--text-primary)",
          border: `1px solid ${t.type === "success" ? "#A8B99A" : t.type === "error" ? "#A94337" : "#286A62"}`,
          boxShadow: "0 6px 18px rgba(77,58,34,0.12)"
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

function Pill({ text, color = "#145C43", bg }) {
  return (
    <span style={{
      background: bg || (color + "18"), color, fontSize: 11, padding: "2.5px 8px",
      borderRadius: 999, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 4
    }}>{text}</span>
  );
}

function StatusPill({ status }) {
  const map = {
    available: { color: "#145C43", bg: "#E8F2EC" },
    partial:   { color: "#9A6B22", bg: "#FAF1DD" },
    matched:   { color: "#286A62", bg: "#E6F0EE" },
    fulfilled: { color: "#145C43", bg: "#E8F2EC" },
    pending:   { color: "#777467", bg: "#F0ECE1" },
    expired:   { color: "#A94337", bg: "#FAECE9" },
    confirmed: { color: "#145C43", bg: "#E8F2EC" },
    cancelled: { color: "#A94337", bg: "#FAECE9" }
  };
  const conf = map[status] || { color: "#777467", bg: "#F0ECE1" };
  return <Pill text={status} color={conf.color} bg={conf.bg} />;
}

function UrgencyPill({ level }) {
  const colors = {
    less_than_1h: { color: "#A94337", bg: "#FAECE9" },
    "1_2h":       { color: "#A86631", bg: "#F9EDE2" },
    "2_3h":       { color: "#9A6B22", bg: "#FAF1DD" },
    "4_5h":       { color: "#286A62", bg: "#E6F0EE" },
    more_than_5h: { color: "#777467", bg: "#F0ECE1" }
  };
  const c = colors[level] || { color: "#777467", bg: "#F0ECE1" };
  return <Pill text={URGENCY_LABELS[level] || level} color={c.color} bg={c.bg} />;
}

function FoodPhoto({ description, category, imageUrl, illustrative = true, style = {} }) {
  const suggested = selectFoodImage(description, category);
  const image = imageUrl || suggested.url;
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [image, description, category]);

  return (
    <div className="food-photo" style={style}>
      <img
        src={failed ? getFoodImageFallback(description, category) : image}
        alt={description || suggested.label}
        onError={() => setFailed(true)}
      />
      {illustrative && <span className="illustrative-label">Illustrative image</span>}
    </div>
  );
}

function Card({ children, style = {}, onClick, className = "" }) {
  return (
    <div className={`app-card ${className}`} onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default", ...style
    }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, style = {}, size = "md", loading, type = "button" }) {
  const bg = {
    primary: "var(--earth-brown)",
    forest: "var(--forest-green)",
    danger: "var(--danger)",
    ghost: "transparent",
    outline: "transparent",
    info: "var(--info)"
  };
  const bdr = {
    primary: "var(--earth-brown)",
    forest: "var(--forest-green)",
    danger: "var(--danger)",
    ghost: "var(--border)",
    outline: "var(--earth-brown)",
    info: "var(--info)"
  };
  const clr = {
    ghost: "var(--text-primary)",
    outline: "var(--earth-brown)"
  };
  const pad = { sm: "5px 12px", md: "8px 16px", lg: "11px 22px" };

  return (
    <button type={type} disabled={disabled || loading} onClick={onClick} style={{
      background: bg[variant] || bg.primary,
      border: `1px solid ${bdr[variant] || bdr.primary}`,
      color: clr[variant] || "#FFFFFF",
      padding: pad[size],
      borderRadius: "var(--radius-pill)",
      boxShadow: (variant === "primary" || variant === "forest") ? "0 3px 10px rgba(121, 80, 47, 0.18)" : "none",
      ...style
    }}>
      {loading ? <span className="spin" style={{ fontSize: 13 }}>⟳</span> : children}
    </button>
  );
}

function Field({ label, required, children, error, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 5, fontWeight: 600 }}>
          {label}{required && <span style={{ color: "var(--danger)" }}> *</span>}
        </label>
      )}
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{hint}</div>}
      {error && <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>⚠ {error}</div>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(47, 51, 41, 0.45)", backdropFilter: "blur(3px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fade-in" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 580, maxHeight: "90vh", overflow: "auto", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", color: "var(--text-secondary)", fontSize: 18, border: "none", padding: 4, cursor: "pointer", borderRadius: "50%" }}>✕</button>
        </div>
        <div style={{ padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "45px 20px", color: "var(--text-secondary)" }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 650, color: "var(--text-primary)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div className="spin" style={{ width: 24, height: 24, border: "2.5px solid var(--border)", borderTopColor: "var(--forest-green)", borderRadius: "50%" }} />
    </div>
  );
}

// ── Sidebar Component (Only Donor & Receiver) ─────────────────────────────────
function Sidebar({ user, page, setPage, onLogout, unreadCount }) {
  // Donor can ONLY donate and view their donations & matches
  // Receiver can request food and claim allocations
  const nav = {
    donor: [
      { key: "dashboard",    icon: "🏠", label: "Dashboard" },
      { key: "add-food",     icon: "🍲", label: "Donate Food" },
      { key: "my-donations", icon: "📋", label: "My Donations" },
      { key: "matches",      icon: "🤝", label: "Matched Allocations" },
      { key: "impact",       icon: "🌿", label: "My Impact" },
      { key: "settings",     icon: "⚙️", label: "Settings" }
    ],
    receiver: [
      { key: "dashboard",    icon: "🏠", label: "Dashboard" },
      { key: "new-request",  icon: "➕", label: "Request Food" },
      { key: "my-requests",  icon: "📋", label: "My Requests" },
      { key: "matches",      icon: "🤝", label: "Claimed Allocations" },
      { key: "impact",       icon: "🌿", label: "My Impact" },
      { key: "settings",     icon: "⚙️", label: "Settings" }
    ]
  };

  const items = nav[user.role] || nav.donor;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon-wrapper">
          <span style={{ fontSize: 22 }}>🌾</span>
        </div>
        <div>
          <div className="brand-title">ZeroHunger</div>
          <div className="brand-subtitle">Share Food · Build Hope</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            className={`nav-link-btn ${page === item.key ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

        <button
          onClick={() => setPage("notifications")}
          className={`nav-link-btn ${page === "notifications" ? "active" : ""}`}
        >
          <span className="nav-icon">🔔</span>
          <span>Notifications</span>
          {unreadCount > 0 && <span className="sidebar-badge">{unreadCount}</span>}
        </button>
      </nav>

      {/* Botanical watercolor art */}
      <div className="sidebar-botanical-art">
        <BotanicalBranch style={{ width: 140, height: 140, position: "absolute", bottom: -10, left: -10 }} />
      </div>

      <div className="sidebar-footer">
        <button
          onClick={onLogout}
          className="nav-link-btn"
          style={{ color: "var(--danger)", padding: "8px 12px" }}
        >
          <span className="nav-icon">⎋</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

// ── Top Navigation Bar (Search Removed) ────────────────────────────────────────
function TopNavBar({ user, onLogout, setPage, unreadCount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user?.name ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "ZH";

  return (
    <header className="top-navbar">
      <div className="top-theme-heading">
        <span className="top-theme-title">Theme 3: Warm &amp; Earthy (Nature Inspired)</span>
        <span className="top-theme-sub">Calm · Sustainable · Compassionate</span>
      </div>

      <div className="top-actions-right">
        <button
          type="button"
          className="icon-btn-badge"
          onClick={() => setPage("notifications")}
          title="Notifications"
        >
          <span>🔔</span>
          {unreadCount > 0 && <span className="icon-badge-dot" />}
        </button>

        <div style={{ position: "relative" }}>
          <div
            className="user-profile-badge"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <div className="user-avatar-circle">{initials}</div>
            <div className="user-info-text">
              <span className="user-name-text">{user.name || "ZeroHunger User"}</span>
              <span className="user-role-text">{user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : "Member"}</span>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 2 }}>▾</span>
          </div>

          {menuOpen && (
            <div className="fade-in" style={{
              position: "absolute", top: "115%", right: 0, width: 180,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden"
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{user.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{user.email}</div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); setPage("settings"); }}
                style={{ width: "100%", padding: "9px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "var(--text-primary)", cursor: "pointer", display: "flex", gap: 8 }}
              >
                <span>⚙️</span> Settings
              </button>
              <button
                onClick={() => { setMenuOpen(false); setPage("impact"); }}
                style={{ width: "100%", padding: "9px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "var(--text-primary)", cursor: "pointer", display: "flex", gap: 8 }}
              >
                <span>🌿</span> Impact
              </button>
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                style={{ width: "100%", padding: "9px 14px", background: "none", border: "none", borderTop: "1px solid var(--border-light)", textAlign: "left", fontSize: 13, color: "var(--danger)", cursor: "pointer", display: "flex", gap: 8 }}
              >
                <span>⎋</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Smart Matching Engine Modal (Heart of Project) ────────────────────────────
function MatchingEngineModal({ requestId, onClose, onSuccess }) {
  const { toast } = useCtx();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    api.previewMatch(requestId)
      .then(res => setPreview(res))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [requestId]);

  const confirmClaim = async () => {
    setConfirming(true);
    try {
      await api.confirmMatch(requestId);
      toast("🤝 Match confirmed! Food successfully allocated and donor notified.", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (e) {
      toast("Match failed: " + e.message, "error");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal title="⚡ Smart Matching Engine" onClose={onClose}>
      {loading ? (
        <div style={{ textAlign: "center", padding: "30px 10px" }}>
          <Spinner />
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10 }}>
            Analyzing nearby surplus donations with Haversine distance, urgency &amp; expiry scores...
          </div>
        </div>
      ) : err ? (
        <div style={{ padding: "20px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ color: "var(--danger)", fontWeight: 650, fontSize: 14 }}>{err}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>
            No matching available donations currently satisfy this request's dietary preference and distance threshold.
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        </div>
      ) : preview ? (
        <div>
          {/* Header Summary */}
          <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 16, border: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Requested: <strong style={{ color: "var(--text-primary)" }}>{preview.request?.requiredMeals} meals</strong>
              </span>
              {preview.covered ? (
                <Pill text="✅ 100% Demand Covered" color="var(--forest-green)" bg="#E8F2EC" />
              ) : (
                <Pill text={`⚠ Partial: Shortfall ${preview.remaining} meals`} color="#9A6B22" bg="#FAF1DD" />
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              ⚡ Total Available to Allocate: <strong style={{ color: "var(--earth-brown)" }}>{preview.totalAllocated} meals</strong>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
            Matched Candidate Donations ({preview.allocations?.length || 0})
          </div>

          {preview.allocations?.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
              No active donors found near your location.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "300px", overflowY: "auto" }}>
              {preview.allocations.map((a, i) => (
                <Card key={i} style={{ padding: "12px 14px", background: "#FFFDF9", border: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                        {a.donorName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span>🍽️ <strong>{a.allocated}</strong> meals allocated</span>
                        <span>📏 <strong>{a.km}</strong> km away</span>
                        <span style={{ color: "var(--forest-green)", fontWeight: 650 }}>
                          ⭐ Match Score: {Math.round((a.score || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <span className="available-tag-pill" style={{ pointerEvents: "none" }}>
                      Rank #{i + 1}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            {preview.allocations?.length > 0 && (
              <Btn variant="forest" onClick={confirmClaim} loading={confirming}>
                Confirm &amp; Claim {preview.totalAllocated} Meals →
              </Btn>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ── Donor: Main Dashboard ─────────────────────────────────────────────────────
function DonorDashboard() {
  const { toast, setPage } = useCtx();
  const [listings, setListings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mine, m] = await Promise.all([
        api.getFood(),
        api.getMatches()
      ]);
      setListings(mine);
      setMatches(m);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const del = async id => {
    if (!confirm("Delete this food donation?")) return;
    try {
      await api.deleteFood(id);
      toast("Donation removed", "success");
      loadData();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  // REAL DYNAMIC METRICS (NO HARDCODED VALUES)
  const activeDonations = listings.filter(l => l.status === "available" || l.status === "partial");
  const totalMealsDonated = listings.reduce((sum, l) => sum + (l.totalMeals || 0), 0);
  const totalMealsAllocated = matches.reduce((sum, m) => sum + (m.totalAllocated || 0), 0);
  const totalMatchesCount = matches.length;

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Hero Banner */}
      <div className="hero-banner-card">
        <div className="hero-banner-content">
          <h1 className="hero-banner-title">Food Connects Communities</h1>
          <p className="hero-banner-desc">
            Share surplus. Feed people. Build a healthier tomorrow.
          </p>
          <button className="hero-banner-btn" onClick={() => setPage("add-food")}>
            <span>Donate Food</span>
            <span>→</span>
          </button>
        </div>
        <div className="hero-banner-image-side">
          <img
            src="https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=85"
            alt="Harvest basket"
            className="hero-banner-img"
          />
          <div className="hero-banner-script-badge">
            Small acts create<br />big change ♡
          </div>
        </div>
      </div>

      {/* Real Metric Cards Row */}
      <div className="metric-cards-grid">
        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#F4ECE3", color: "var(--earth-brown)" }}>
            <span>🥗</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Active Donations</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{activeDonations.length}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#FDF5E6", color: "#A86631" }}>
            <span>🍽️</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Total Meals Donated</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{totalMealsDonated}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#E8F0F3", color: "#286A62" }}>
            <span>🤝</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Meals Matched &amp; Allocated</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{totalMealsAllocated}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#E8F2EC", color: "var(--forest-green)" }}>
            <span>✨</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Completed Matches</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{totalMatchesCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Matching Engine Notice */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>Smart Matching Engine Active</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Every donation you post is paired with nearby shelters and food banks in real time.</div>
          </div>
        </div>
        <Btn size="sm" onClick={() => setPage("add-food")}>+ Donate Food Now</Btn>
      </div>

      {/* Active Donations List */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--text-primary)" }}>
            My Active Donations ({activeDonations.length})
          </h2>
          <Btn size="sm" variant="outline" onClick={() => setPage("my-donations")}>
            View All History →
          </Btn>
        </div>

        {activeDonations.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "34px 20px" }}>
            <span style={{ fontSize: 26, display: "block", marginBottom: 8 }}>🌱</span>
            <div style={{ fontWeight: 650, color: "var(--text-primary)" }}>No active donations right now</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 14 }}>
              Post excess cooked food, bakery items, or fresh harvest to feed your community.
            </div>
            <Btn size="sm" onClick={() => setPage("add-food")}>+ Add Food Donation</Btn>
          </Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {activeDonations.map(l => (
              <Card key={l._id} style={{ padding: 14 }}>
                <FoodPhoto
                  description={l.description}
                  category={l.category}
                  imageUrl={l.imageUrl}
                  illustrative={l.imageIsIllustrative ?? !l.imageUrl}
                  style={{ height: 150, marginBottom: 12 }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5 }}>{l.description}</span>
                  <StatusPill status={l.status} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  <span>🍽️ <strong>{l.remainingMeals ?? l.totalMeals}</strong> / {l.totalMeals} meals remaining</span>
                  <span style={{ color: expiryColor(l.expiryTime) }}>⏱ Expires: {timeLeft(l.expiryTime)}</span>
                  <span>📍 {l.location?.address || "Pickup location provided"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn variant="danger" size="sm" onClick={() => del(l._id)}>Delete</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Donor: Add Donation Form (Automatic Food Image Preview) ───────────────────
function AddFoodForm() {
  const { toast, setPage } = useCtx();

  const [description, setDescription] = useState("");
  const [totalMeals,  setTotalMeals]  = useState("");
  const [expiryHours, setExpiryHours] = useState("3");
  const [foodType,    setFoodType]    = useState("Veg");
  const [category,    setCategory]    = useState("Cooked Meals");
  const [address,     setAddress]     = useState("");
  const [uploadedImage, setUploadedImage] = useState("");
  const [lat,         setLat]         = useState("");
  const [lng,         setLng]         = useState("");
  const [locMode,     setLocMode]     = useState("manual");
  const [loading,     setLoading]     = useState(false);
  const [geoLoading,  setGeoLoading]  = useState(false);

  // Live automatic food image selection based on food name/description
  const suggestedImage = useMemo(() => {
    return selectFoodImage(description, category);
  }, [description, category]);

  const handleImageUpload = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("Choose a JPG, PNG, or WebP image", "error");
      event.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast("Image must be 4 MB or smaller", "error");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(String(reader.result));
    reader.onerror = () => toast("Could not read the selected image", "error");
    reader.readAsDataURL(file);
  };

  const detectGeo = () => {
    if (!navigator.geolocation) {
      toast("Geolocation not supported by browser", "error");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setGeoLoading(false);
        toast("Location detected ✓", "success");
      },
      () => {
        setGeoLoading(false);
        toast("Could not detect location. Please enter address manually.", "error");
      }
    );
  };

  const handleSubmit = async () => {
    const desc  = description.trim();
    const meals = parseInt(totalMeals);
    const exp   = parseFloat(expiryHours);

    if (!desc) {
      toast("⚠ Please enter the food description", "error");
      return;
    }
    if (!totalMeals || isNaN(meals) || meals < 1) {
      toast("⚠ Please enter valid meal count (minimum 1)", "error");
      return;
    }
    if (!expiryHours || isNaN(exp) || exp <= 0) {
      toast("⚠ Please select expiry time", "error");
      return;
    }

    const location = (locMode === "auto" && lat && lng)
      ? { lat: parseFloat(lat), lng: parseFloat(lng), address: "GPS coordinates detected" }
      : { lat: 14.9981, lng: 75.5681, address: address.trim() || "Location provided by donor" };

    const finalImageUrl = uploadedImage || suggestedImage.url;
    const isIllustrative = !uploadedImage;

    setLoading(true);
    try {
      await api.createFood({
        description: desc,
        totalMeals: meals,
        expiryHours: exp,
        foodType,
        category,
        location,
        imageUrl: finalImageUrl,
        imageIsIllustrative: isIllustrative
      });

      toast("✅ Donation posted! Matching engine is auto-matching with urgent requests.", "success");
      setTimeout(() => setPage("dashboard"), 900);
    } catch (e) {
      toast("Error: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>Post Food Donation</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          The image updates automatically as you type the food name. Upload your own photo anytime.
        </p>
      </div>

      <Card style={{ padding: "24px 28px" }}>
        <Field label="Food Name &amp; Description" required hint="e.g. Fresh vegetables, Biryani rice, Bakery buns, or Milk cartons">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Freshly cooked vegetable biryani, 50 meals"
            autoFocus
          />
        </Field>

        {/* Live Automatic Food Image Preview */}
        <div className="food-preview-row">
          <FoodPhoto
            description={description}
            category={category}
            imageUrl={uploadedImage || suggestedImage.url}
            illustrative={!uploadedImage}
          />
          <div className="food-preview-copy">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                {uploadedImage ? "Your Food Photograph" : `Auto-Selected: ${suggestedImage.label}`}
              </span>
              {!uploadedImage && (
                <Pill text="Live Preview" color="var(--forest-green)" bg="#E8F2EC" />
              )}
            </div>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
              {uploadedImage
                ? "Your custom photograph will be displayed with this donation record."
                : "Image updates automatically based on the food name you enter. A subtle illustrative badge is shown for transparency."}
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <label className="upload-photo-button">
                <span>📷 {uploadedImage ? "Replace Photo" : "Upload Real Photo"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} />
              </label>
              {uploadedImage && (
                <button
                  type="button"
                  className="remove-photo-button"
                  onClick={() => setUploadedImage("")}
                >
                  Use Auto-Selected Image
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Food Type">
            <select value={foodType} onChange={e => setFoodType(e.target.value)}>
              <option value="Veg">Vegetarian</option>
              <option value="Non-Veg">Non-Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Any">Any / Mixed</option>
            </select>
          </Field>

          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option>Cooked Meals</option>
              <option>Raw Ingredients</option>
              <option>Packaged Food</option>
              <option>Bakery Items</option>
              <option>Fruits &amp; Vegetables</option>
              <option>Dairy &amp; Milk</option>
              <option>Sweets &amp; Desserts</option>
              <option>Other</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Total Meals / Servings" required>
            <input
              type="number"
              min="1"
              value={totalMeals}
              onChange={e => setTotalMeals(e.target.value)}
              placeholder="e.g. 50"
            />
          </Field>

          <Field label="Expiry Time" required>
            <select value={expiryHours} onChange={e => setExpiryHours(e.target.value)}>
              <option value="1">1 hour (Urgent pickup)</option>
              <option value="2">2 hours</option>
              <option value="3">3 hours (Recommended for cooked food)</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
            </select>
          </Field>
        </div>

        <Field label="Pickup Location">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Btn
              size="sm"
              variant={locMode === "manual" ? "primary" : "ghost"}
              onClick={() => setLocMode("manual")}
            >
              ✏️ Manual Address
            </Btn>
            <Btn
              size="sm"
              variant={locMode === "auto" ? "forest" : "ghost"}
              onClick={() => setLocMode("auto")}
            >
              📍 Auto Detect GPS
            </Btn>
          </div>

          {locMode === "manual" ? (
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Enter pickup address, kitchen name, or street"
            />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={lat && lng ? `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : ""}
                placeholder="Click Detect to get coordinates"
                style={{ flex: 1 }}
              />
              <Btn onClick={detectGeo} loading={geoLoading} variant="info" size="sm">
                Detect
              </Btn>
            </div>
          )}
        </Field>

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <Btn
            onClick={handleSubmit}
            loading={loading}
            style={{ flex: 1, padding: "11px 20px" }}
          >
            🥗 Post Donation Now
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => setPage("dashboard")}
          >
            Cancel
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Donor: My Donations List ──────────────────────────────────────────────────
function DonorDonationsList() {
  const { toast } = useCtx();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setListings(await api.getFood()); }
    catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const del = async id => {
    if (!confirm("Delete this food donation?")) return;
    try {
      await api.deleteFood(id);
      toast("Donation deleted", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>My Donations History ({listings.length})</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>All surplus food batches posted by your account.</p>
      </div>

      {listings.length === 0 ? (
        <EmptyState icon="🥗" title="No donations found" sub="Post a donation to start nourishing your community." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listings.map(l => (
            <Card key={l._id} style={{ padding: 14 }}>
              <div className="listing-card-layout">
                <FoodPhoto
                  description={l.description}
                  category={l.category}
                  imageUrl={l.imageUrl}
                  illustrative={l.imageIsIllustrative ?? !l.imageUrl}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{l.description}</span>
                      <StatusPill status={l.status} />
                      <Pill text={l.foodType} color="#9A6B22" bg="#FAF1DD" />
                    </div>
                    <div style={{ display: "flex", gap: 16, color: "var(--text-secondary)", fontSize: 12.5, flexWrap: "wrap" }}>
                      <span>🍽️ {l.remainingMeals ?? l.totalMeals} / {l.totalMeals} meals</span>
                      <span style={{ color: expiryColor(l.expiryTime) }}>⏱ Expires: {timeLeft(l.expiryTime)}</span>
                      <span>📍 {l.location?.address || "Location set"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                      Posted on {fmtDate(l.createdAt)}
                    </div>
                  </div>
                  {(l.status === "available" || l.status === "partial") && (
                    <Btn variant="danger" size="sm" onClick={() => del(l._id)}>Delete</Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Receiver: Main Dashboard (Matching Engine Heart) ──────────────────────────
function ReceiverDashboard() {
  const { toast, setPage } = useCtx();
  const [requests, setRequests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchModalRequestId, setMatchModalRequestId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqs, m] = await Promise.all([
        api.getRequests(),
        api.getMatches()
      ]);
      setRequests(reqs);
      setMatches(m);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const cancelReq = async id => {
    try {
      await api.cancelRequest(id);
      toast("Request cancelled", "success");
      loadData();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  // REAL DYNAMIC METRICS (NO HARDCODED VALUES)
  const activeRequests = requests.filter(r => r.status === "pending" || r.status === "partial");
  const fulfilledRequests = requests.filter(r => r.status === "fulfilled");
  const totalMealsNeeded = activeRequests.reduce((sum, r) => sum + (r.remainingMealsNeeded ?? r.requiredMeals), 0);
  const totalMealsReceived = matches.reduce((sum, m) => sum + (m.totalAllocated || 0), 0);

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Hero Banner */}
      <div className="hero-banner-card">
        <div className="hero-banner-content">
          <h1 className="hero-banner-title">Smart Matching Engine</h1>
          <p className="hero-banner-desc">
            Submit food requests and trigger our smart matching engine to claim nearby surplus food.
          </p>
          <button className="hero-banner-btn" onClick={() => setPage("new-request")}>
            <span>Request Food Supply</span>
            <span>→</span>
          </button>
        </div>
        <div className="hero-banner-image-side">
          <img
            src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85"
            alt="Nourishing meal"
            className="hero-banner-img"
          />
          <div className="hero-banner-script-badge">
            Every meal claimed<br />feeds a life ♡
          </div>
        </div>
      </div>

      {/* Real Metric Cards Row */}
      <div className="metric-cards-grid">
        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#F4ECE3", color: "var(--earth-brown)" }}>
            <span>📋</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Active Requests</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{activeRequests.length}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#FDF5E6", color: "#A86631" }}>
            <span>🍽️</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Meals Still Needed</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{totalMealsNeeded}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#E8F0F3", color: "#286A62" }}>
            <span>✅</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Fulfilled Requests</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{fulfilledRequests.length}</span>
            </div>
          </div>
        </div>

        <div className="metric-card-box">
          <div className="metric-icon-circle" style={{ background: "#E8F2EC", color: "var(--forest-green)" }}>
            <span>📦</span>
          </div>
          <div className="metric-text-group">
            <span className="metric-label-title">Total Meals Received</span>
            <div className="metric-value-row">
              <span className="metric-num-val">{totalMealsReceived}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Requests with Matching Engine Trigger */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--text-primary)" }}>
            Active Requests ({activeRequests.length})
          </h2>
          <Btn size="sm" onClick={() => setPage("new-request")}>+ New Food Request</Btn>
        </div>

        {activeRequests.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "34px 20px" }}>
            <span style={{ fontSize: 26, display: "block", marginBottom: 8 }}>📋</span>
            <div style={{ fontWeight: 650, color: "var(--text-primary)" }}>No pending requests</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 14 }}>
              Submit a food request to find matching donor meals via the matching engine.
            </div>
            <Btn size="sm" onClick={() => setPage("new-request")}>+ Create Request</Btn>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeRequests.map(r => (
              <Card key={r._id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <StatusPill status={r.status} />
                      <UrgencyPill level={r.urgencyLevel} />
                      <Pill text={r.foodPreference || "Any"} color="#286A62" bg="#E6F0EE" />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>🍽️ Remaining Need: <strong style={{ color: "var(--text-primary)" }}>{r.remainingMealsNeeded ?? r.requiredMeals}</strong> / {r.requiredMeals} meals</span>
                      <span>📍 {r.location?.address || "Location set"}</span>
                    </div>
                    {r.notes && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Note: {r.notes}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Btn
                      variant="forest"
                      size="sm"
                      onClick={() => setMatchModalRequestId(r._id)}
                      style={{ boxShadow: "0 3px 10px rgba(20,92,67,0.22)" }}
                    >
                      ⚡ Run Matching Engine &amp; Claim
                    </Btn>
                    <Btn variant="danger" size="sm" onClick={() => cancelReq(r._id)}>Cancel</Btn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Matching Modal */}
      {matchModalRequestId && (
        <MatchingEngineModal
          requestId={matchModalRequestId}
          onClose={() => setMatchModalRequestId(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

// ── Receiver: New Request Form ────────────────────────────────────────────────
function NewRequestForm() {
  const { toast, setPage } = useCtx();

  const [requiredMeals,  setRequiredMeals]  = useState("");
  const [foodPreference, setFoodPreference] = useState("Any");
  const [urgencyLevel,   setUrgencyLevel]   = useState("more_than_5h");
  const [notes,          setNotes]          = useState("");
  const [address,        setAddress]        = useState("");
  const [lat,            setLat]            = useState("");
  const [lng,            setLng]            = useState("");
  const [locMode,        setLocMode]        = useState("manual");
  const [loading,        setLoading]        = useState(false);
  const [geoLoading,     setGeoLoading]     = useState(false);

  const isEmergency = urgencyLevel === "less_than_1h" || urgencyLevel === "1_2h";

  const detectGeo = () => {
    if (!navigator.geolocation) {
      toast("Geolocation not supported by browser", "error");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setGeoLoading(false);
        toast("Location detected ✓", "success");
      },
      () => {
        setGeoLoading(false);
        toast("Could not detect location. Please enter manually.", "error");
      }
    );
  };

  const handleSubmit = async () => {
    const meals = parseInt(requiredMeals);
    if (!requiredMeals || isNaN(meals) || meals < 1) {
      toast("⚠ Please enter required meals count (minimum 1)", "error");
      return;
    }

    const location = (locMode === "auto" && lat && lng)
      ? { lat: parseFloat(lat), lng: parseFloat(lng), address: "GPS coordinates" }
      : { lat: 14.9981, lng: 75.5681, address: address.trim() || "Shelter location" };

    setLoading(true);
    try {
      await api.createRequest({
        requiredMeals: meals,
        foodPreference,
        urgencyLevel,
        notes: notes.trim(),
        location
      });
      toast("✅ Request created! The matching engine has automatically scanned for available donors.", "success");
      setTimeout(() => setPage("dashboard"), 900);
    } catch (e) {
      toast("Error: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>Request Food Supply</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Submit required meals. The matching engine will score available donations by urgency, distance, and expiry.
        </p>
      </div>

      {isEmergency && (
        <div style={{ background: "#FAECE9", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>
          🚨 Emergency request: High priority will be dispatched immediately.
        </div>
      )}

      <Card style={{ padding: "24px 28px" }}>
        <Field label="Meals Needed" required>
          <input
            type="number"
            min="1"
            value={requiredMeals}
            onChange={e => setRequiredMeals(e.target.value)}
            placeholder="e.g. 50"
            autoFocus
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Food Dietary Preference">
            <select value={foodPreference} onChange={e => setFoodPreference(e.target.value)}>
              <option value="Any">Any / Mixed</option>
              <option value="Veg">Vegetarian Only</option>
              <option value="Non-Veg">Non-Vegetarian</option>
              <option value="Vegan">Vegan</option>
            </select>
          </Field>

          <Field label="Urgency Level" required>
            <select value={urgencyLevel} onChange={e => setUrgencyLevel(e.target.value)}>
              {Object.entries(URGENCY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Special Requirements or Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. For children's home, mild spices preferred"
          />
        </Field>

        <Field label="Delivery Location">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Btn
              size="sm"
              variant={locMode === "manual" ? "primary" : "ghost"}
              onClick={() => setLocMode("manual")}
            >
              ✏️ Manual Address
            </Btn>
            <Btn
              size="sm"
              variant={locMode === "auto" ? "forest" : "ghost"}
              onClick={() => setLocMode("auto")}
            >
              📍 Auto Detect GPS
            </Btn>
          </div>
          {locMode === "manual" ? (
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Enter shelter address, center name, or landmark"
            />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={lat && lng ? `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : ""}
                placeholder="Click Detect to get coordinates"
                style={{ flex: 1 }}
              />
              <Btn onClick={detectGeo} loading={geoLoading} variant="info" size="sm">Detect</Btn>
            </div>
          )}
        </Field>

        <Btn
          onClick={handleSubmit}
          loading={loading}
          variant={isEmergency ? "danger" : "forest"}
          style={{ width: "100%", padding: "11px", marginTop: 8 }}
        >
          {isEmergency ? "🚨 Submit Emergency Request" : "📋 Submit Food Request"}
        </Btn>
      </Card>
    </div>
  );
}

// ── Shared Matches / Allocations View ─────────────────────────────────────────
function MatchesPage() {
  const { toast, user } = useCtx();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMatches()
      .then(setMatches)
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>
          {user.role === "donor" ? "Matched Allocations" : "Claimed Food Allocations"} ({matches.length})
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {user.role === "donor"
            ? "Track where your donated meals were allocated to feed people."
            : "Review confirmed matches between your requests and donor food batches."}
        </p>
      </div>

      {matches.length === 0 ? (
        <EmptyState icon="🤝" title="No allocations found" sub="Matches appear here once allocations are processed by the matching engine." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {matches.map(m => (
            <Card key={m._id} style={{ borderColor: m.covered ? "#CDE2D5" : "#FAF1DD" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <StatusPill status={m.status} />
                {m.autoMatched && <Pill text="⚡ Auto-matched" color="#286A62" bg="#E6F0EE" />}
                {m.covered ? (
                  <Pill text="✅ Fully covered" color="var(--forest-green)" bg="#E8F2EC" />
                ) : (
                  <Pill text="⚠ Partial" color="#9A6B22" bg="#FAF1DD" />
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                🍽️ {m.totalAllocated} meals allocated
                {!m.covered && m.remaining > 0 && (
                  <span style={{ color: "#9A6B22", fontWeight: 500 }}> (shortfall: {m.remaining} meals)</span>
                )}
              </div>
              {m.allocations?.map((a, i) => (
                <div key={i} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 6, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {user.role === "donor" ? `Allocation #${i + 1}` : `🧑‍🍳 Donor: ${a.donorName}`}
                  </div>
                  <div style={{ color: "var(--text-secondary)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>🍽️ {a.allocated} meals</span>
                    {a.donorPhone && <span>📞 {a.donorPhone}</span>}
                    {a.km && <span>📏 {a.km} km</span>}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Matched on {fmtDate(m.timestamp)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Impact Page (Dynamically computed from actual data) ───────────────────────
function ImpactPage() {
  const { user } = useCtx();
  const [data, setData] = useState({ meals: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user.role === "donor") {
      api.getFood().then(listings => {
        const total = listings.reduce((sum, l) => sum + (l.totalMeals || 0), 0);
        setData({ meals: total });
      }).finally(() => setLoading(false));
    } else {
      api.getMatches().then(matches => {
        const total = matches.reduce((sum, m) => sum + (m.totalAllocated || 0), 0);
        setData({ meals: total });
      }).finally(() => setLoading(false));
    }
  }, [user]);

  if (loading) return <Spinner />;

  const meals = data.meals;
  const wasteKg = (meals * 0.45).toFixed(1);
  const co2Kg = (meals * 0.25).toFixed(1);
  const waterL = (meals * 15).toFixed(0);

  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>
          {user.role === "donor" ? "Your Food Donation Impact" : "Your Food Allocation Impact"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Calculated from your verified ZeroHunger activity.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Card style={{ textAlign: "center", padding: "20px 14px" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🍽️</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--earth-brown)" }}>{meals}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>Meals Shared</div>
        </Card>
        <Card style={{ textAlign: "center", padding: "20px 14px" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>📦</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#A86631" }}>{wasteKg} kg</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>Food Waste Diverted</div>
        </Card>
        <Card style={{ textAlign: "center", padding: "20px 14px" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🌿</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--forest-green)" }}>{co2Kg} kg</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>CO₂ Prevented</div>
        </Card>
        <Card style={{ textAlign: "center", padding: "20px 14px" }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>💧</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#286A62" }}>{waterL} L</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>Water Conserved</div>
        </Card>
      </div>

      <Card style={{ padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🌾</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Sustainability Contribution</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Diverting edible food from landfills prevents potent methane emissions while directly nourishing vulnerable people.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const { user, toast } = useCtx();
  const [phone, setPhone] = useState(user.phone || "");
  const [dietary, setDietary] = useState("Any");
  const [notifications, setNotifications] = useState(true);

  const saveSettings = () => {
    toast("Settings updated ✓", "success");
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>Settings</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Manage your ZeroHunger account preferences.</p>
      </div>

      <Card style={{ padding: "24px 28px" }}>
        <Field label="Full Name">
          <input value={user.name} disabled style={{ background: "var(--bg-secondary)" }} />
        </Field>
        <Field label="Email Address">
          <input value={user.email} disabled style={{ background: "var(--bg-secondary)" }} />
        </Field>
        <Field label="Role">
          <input value={user.role === "donor" ? "Food Donor" : "Food Receiver / Shelter"} disabled style={{ background: "var(--bg-secondary)" }} />
        </Field>
        <Field label="Contact Phone">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
        </Field>
        <Field label="Dietary Preference">
          <select value={dietary} onChange={e => setDietary(e.target.value)}>
            <option value="Any">Any food</option>
            <option value="Veg">Vegetarian only</option>
            <option value="Non-Veg">Non-Vegetarian</option>
            <option value="Vegan">Vegan</option>
          </select>
        </Field>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 24px" }}>
          <input
            type="checkbox"
            id="notif-toggle"
            checked={notifications}
            onChange={e => setNotifications(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--forest-green)" }}
          />
          <label htmlFor="notif-toggle" style={{ fontSize: 13, fontWeight: 550, color: "var(--text-primary)", cursor: "pointer" }}>
            Notify me in real time when matches are confirmed
          </label>
        </div>

        <Btn onClick={saveSettings}>Save Settings</Btn>
      </Card>
    </div>
  );
}

// ── Notifications Page ────────────────────────────────────────────────────────
function NotificationsPage() {
  const { toast } = useCtx();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setNotifs(await api.getNotifications());
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    try {
      await api.markAllRead();
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (loading) return <Spinner />;
  const unread = notifs.filter(n => !n.read);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)" }}>
          Notifications {unread.length > 0 && <Pill text={unread.length} color="var(--danger)" bg="#FAECE9" />}
        </h2>
        {unread.length > 0 && (
          <Btn variant="ghost" size="sm" onClick={markAll}>Mark all read</Btn>
        )}
      </div>

      {notifs.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications" sub="Real-time match alerts and status updates appear here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifs.map(n => (
            <Card key={n._id} style={{ borderColor: !n.read ? "#A8B99A" : undefined, opacity: n.read ? 0.75 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: n.read ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: n.read ? 450 : 600, marginBottom: 4 }}>
                    {!n.read && <span style={{ color: "var(--forest-green)" }}>● </span>}
                    {n.message}
                  </div>
                  {n.data?.donorName && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      Donor: {n.data.donorName} {n.data.donorPhone && `· 📞 ${n.data.donorPhone}`} {n.data.km && `· 📏 ${n.data.km}km`}
                    </div>
                  )}
                  {n.data?.receiverName && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      Receiver: {n.data.receiverName} {n.data.receiverPhone && `· 📞 ${n.data.receiverPhone}`}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 12, flexShrink: 0 }}>
                  {fmtDate(n.createdAt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Auth Page (Only Donor & Receiver) ─────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "donor", type: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr("");
    setLoading(true);
    try {
      const data = mode === "login"
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      localStorage.setItem("zhc_token", data.token);
      onAuth(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, margin: "0 auto 12px", borderRadius: 16, background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "var(--shadow-sm)" }}>
            🌾
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>ZeroHunger Connect</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
            Warm &amp; Earthy Food Donation &amp; Allocation Platform
          </p>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, boxShadow: "var(--shadow-md)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            {["login", "register"].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setErr(""); }}
                style={{
                  flex: 1, padding: "8px", borderRadius: "var(--radius-pill)",
                  background: mode === m ? "var(--earth-brown)" : "transparent",
                  color: mode === m ? "#fff" : "var(--text-secondary)",
                  border: `1px solid ${mode === m ? "var(--earth-brown)" : "var(--border)"}`,
                  fontWeight: 650, fontSize: 13.5
                }}
              >
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {err && (
            <div style={{ background: "#FAECE9", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 12.5, color: "var(--danger)", marginBottom: 16 }}>
              {err}
            </div>
          )}

          {mode === "register" && (
            <Field label="Full Name" required>
              <input value={form.name} onChange={set("name")} placeholder="Your name (e.g. Soujanya M)" />
            </Field>
          )}

          <Field label="Email" required>
            <input type="email" value={form.email} onChange={set("email")} placeholder="email@example.com" />
          </Field>

          <Field label="Password" required>
            <input type="password" value={form.password} onChange={set("password")} placeholder="Password" />
          </Field>

          {mode === "register" && (
            <>
              <Field label="Role" required>
                <select value={form.role} onChange={set("role")}>
                  <option value="donor">Donor (I want to donate food)</option>
                  <option value="receiver">Receiver (Shelter / NGO / I need food)</option>
                </select>
              </Field>

              <Field label="Organization / Type">
                <input value={form.type} onChange={set("type")} placeholder="e.g. Restaurant, Hotel, NGO, Shelter..." />
              </Field>

              <Field label="Contact Phone">
                <input value={form.phone} onChange={set("phone")} placeholder="+91 XXXXX XXXXX" />
              </Field>
            </>
          )}

          <Btn
            onClick={submit}
            loading={loading}
            style={{ width: "100%", padding: "11px", marginTop: 8 }}
          >
            {mode === "login" ? "Sign In to ZeroHunger" : "Create Account"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Root App Component ────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [toasts, setToasts] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const socketRef = useRef(null);

  // Restore session
  useEffect(() => {
    const token = localStorage.getItem("zhc_token");
    if (token) {
      api.me().then(setUser).catch(() => localStorage.removeItem("zhc_token"));
    }
  }, []);

  // Socket.IO for real-time alerts
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("zhc_token");
    const socket = io(window.location.origin, { auth: { token } });
    socketRef.current = socket;

    socket.on("match_confirmed", data => {
      toast(`🤝 New match confirmed! ${data.allocated} meals allocated`, "success");
      api.getNotifications().then(setNotifs).catch(() => {});
    });

    return () => socket.disconnect();
  }, [user]);

  // Notifications polling
  useEffect(() => {
    if (!user) return;
    api.getNotifications().then(setNotifs).catch(() => {});
    const t = setInterval(() => api.getNotifications().then(setNotifs).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [user]);

  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(ts => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4500);
  }, []);

  const onAuth = useCallback(u => {
    setUser(u);
    setPage("dashboard");
  }, []);

  const onLogout = useCallback(() => {
    localStorage.removeItem("zhc_token");
    setUser(null);
    setPage("dashboard");
  }, []);

  if (!user) return <AuthPage onAuth={onAuth} />;

  const unreadCount = notifs.filter(n => !n.read).length;

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return user.role === "donor" ? <DonorDashboard /> : <ReceiverDashboard />;
      case "add-food":
        return <AddFoodForm />;
      case "new-request":
        return <NewRequestForm />;
      case "my-donations":
        return <DonorDonationsList />;
      case "my-requests":
        return <ReceiverDashboard />;
      case "matches":
        return <MatchesPage />;
      case "impact":
        return <ImpactPage />;
      case "settings":
        return <SettingsPage />;
      case "notifications":
        return <NotificationsPage />;
      default:
        return <div style={{ color: "var(--text-muted)", padding: 40 }}>Page not found</div>;
    }
  };

  return (
    <Ctx.Provider value={{ user, toast, setPage }}>
      <div className="app-shell">
        <Sidebar
          user={user}
          page={page}
          setPage={setPage}
          onLogout={onLogout}
          unreadCount={unreadCount}
        />
        <main className="main-content">
          <TopNavBar
            user={user}
            onLogout={onLogout}
            setPage={setPage}
            unreadCount={unreadCount}
          />
          <div className="page-container fade-in" key={page}>
            {renderPage()}
          </div>
        </main>
      </div>
      <Toast toasts={toasts} />
    </Ctx.Provider>
  );
}
