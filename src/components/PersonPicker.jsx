/**
 * PersonPicker.jsx
 * Reusable "Select or Create Person" widget for admin booking flows.
 *
 * Lets an admin:
 *   - Search existing real user accounts (/admin/users) and Turo guests (/admin/turo-guests)
 *   - Select one to auto-fill the renter/driver fields and link user_id
 *   - Or type a brand-new person's details and optionally create a real
 *     account for them on the spot (POST /admin/users)
 *
 * Props:
 *   label            — section label (e.g. "Primary Renter")
 *   value            — { userId, name, phone, email, address, city, dob, dlNumber, dlState, dlExp }
 *   onChange(value)  — called whenever the selection/fields change
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useApi } from "../context/AuthContext";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800";

export default function PersonPicker({ label, value, onChange, showDlFields = true }) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [usersRes, guestsRes] = await Promise.all([
          api.get("/admin/users").catch(() => ({ data: [] })),
          api.get("/admin/turo-guests").catch(() => ({ data: [] })),
        ]);
        const qLower = q.toLowerCase();
        const users = (usersRes.data || [])
          .filter(u =>
            (u.fullName || "").toLowerCase().includes(qLower) ||
            (u.email || "").toLowerCase().includes(qLower) ||
            (u.phone || "").includes(q)
          )
          .map(u => ({
            kind: "user",
            userId: u.userId || u.sub,
            name: u.fullName || "(no name)",
            email: u.email || "",
            phone: u.phone || "",
            address: u.address || "",
            city: u.city || "",
            dob: u.dob || "",
            dlNumber: u.dlNumber || "",
            dlState: u.dlState || "",
          }));
        const guests = (guestsRes.data || [])
          .filter(g =>
            (g.name || "").toLowerCase().includes(qLower) ||
            (g.email || "").toLowerCase().includes(qLower) ||
            (g.phone || "").includes(q)
          )
          .map(g => ({
            kind: "turo_guest",
            phone: g.phone,
            name: g.name || "(no name)",
            email: g.email || "",
          }));
        setResults([...users, ...guests].slice(0, 10));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [api]);

  const handleQueryChange = (val) => {
    setQuery(val);
    runSearch(val);
  };

  const selectPerson = (p) => {
    if (p.kind === "user") {
      set({
        userId:   p.userId,
        name:     p.name,
        phone:    p.phone,
        email:    p.email,
        address:  p.address,
        city:     p.city,
        dob:      p.dob,
        dlNumber: p.dlNumber,
        dlState:  p.dlState,
      });
    } else {
      // Turo guest — no user_id yet, just prefill contact info
      set({
        userId: "",
        turoGuestPhone: p.phone,
        name:   p.name,
        phone:  p.phone,
        email:  p.email,
      });
    }
    setQuery(p.name);
    setOpen(false);
    setResults([]);
  };

  const clearSelection = () => {
    onChange({});
    setQuery("");
  };

  const createAccount = async () => {
    if (!v.email) {
      setCreateMsg("Enter an email above before creating an account.");
      return;
    }
    setCreating(true);
    setCreateMsg("");
    try {
      const res = await api.post("/admin/users", {
        email: v.email,
        fullName: v.name || "",
        phone: v.phone || "",
        address: v.address || "",
        city: v.city || "",
        dob: v.dob || "",
        dlNumber: v.dlNumber || "",
        dlState: v.dlState || "",
        turo_guest_phone: v.turoGuestPhone || undefined,
      });
      set({ userId: res.data.user_id, turoGuestPhone: undefined });
      setCreateMsg("Account created — invite email sent.");
    } catch (e) {
      setCreateMsg(e.response?.data?.error || "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">
        {label}
      </p>

      {/* Search / select existing person */}
      <div className="relative mb-3" ref={wrapRef}>
        <input
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search existing users or Turo guests by name/email/phone…"
          className={inp}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-2.5 animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-500" />
        )}
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto text-sm dark:bg-gray-800 dark:border-gray-700">
            {results.map((p, i) => (
              <li
                key={i}
                onClick={() => selectPerson(p)}
                className="px-3 py-2 hover:bg-blue-50 cursor-pointer dark:hover:bg-gray-700 dark:text-gray-200 flex justify-between"
              >
                <span>{p.name}</span>
                <span className="text-xs text-gray-400">
                  {p.kind === "user" ? "Account" : "Turo Guest"} {p.email && `· ${p.email}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {v.userId && (
        <div className="mb-3 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 dark:bg-green-900/20 dark:border-green-700">
          <span>✓ Linked to account (user_id: {v.userId.slice(0, 8)}…) — this person will see this booking after logging in.</span>
          <button onClick={clearSelection} className="text-green-800 underline">Unlink</button>
        </div>
      )}
      {!v.userId && v.turoGuestPhone && (
        <div className="mb-3 flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 dark:bg-amber-900/20 dark:border-amber-700">
          <span>Turo guest selected — no account yet. Create one below so they can view this booking online.</span>
        </div>
      )}

      {/* Manual fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Full Name</label>
          <input type="text" value={v.name || ""} onChange={e => set({ name: e.target.value })} placeholder="Full name" className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Phone</label>
          <input type="tel" value={v.phone || ""} onChange={e => set({ phone: e.target.value })} placeholder="(555) 555-5555" className={inp} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Email</label>
          <input type="email" value={v.email || ""} onChange={e => set({ email: e.target.value })} placeholder="person@example.com" className={inp} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Home Address</label>
          <input type="text" value={v.address || ""} onChange={e => set({ address: e.target.value })} placeholder="123 Main St" className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">City / State / ZIP</label>
          <input type="text" value={v.city || ""} onChange={e => set({ city: e.target.value })} placeholder="Milwaukee, WI 53201" className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Date of Birth</label>
          <input type="date" value={v.dob || ""} onChange={e => set({ dob: e.target.value })} className={inp} />
        </div>
        {showDlFields && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Driver's License #</label>
              <input type="text" value={v.dlNumber || ""} onChange={e => set({ dlNumber: e.target.value })} placeholder="D123-4567-8901" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">License State</label>
              <input type="text" value={v.dlState || ""} onChange={e => set({ dlState: e.target.value })} placeholder="WI" maxLength={2} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">License Expiration</label>
              <input type="date" value={v.dlExp || ""} onChange={e => set({ dlExp: e.target.value })} className={inp} />
            </div>
          </>
        )}
      </div>

      {!v.userId && (
        <div className="mt-3">
          <button
            type="button"
            onClick={createAccount}
            disabled={creating}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {creating ? "Creating…" : "+ Create account for this person"}
          </button>
          {createMsg && (
            <p className={`text-xs mt-1 ${createMsg.startsWith("Failed") || createMsg.startsWith("Enter") ? "text-red-600" : "text-green-600"}`}>
              {createMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
