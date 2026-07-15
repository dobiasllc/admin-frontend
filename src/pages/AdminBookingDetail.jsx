/**
 * AdminBookingDetail.jsx — Check-in/out form, deposit actions, inspection view,
 * and full Tesla guest key management panel.
 * Route: /admin/bookings/:id
 *
 * Changes:
 *  1. Mark-signed now requires an uploaded doc OR a SignWell send first.
 *  2. "Mark as Paid" panel for non-Stripe, non-Turo bookings.
 *  3. "Adjust Booking Times" moved to booking level (works for all vehicles).
 *  4. Contract panel hidden for Turo bookings.
 *  5. Check-in / deposit actions hidden for Turo bookings.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";
import { normalisePortalUrl } from "../utils/guestPortal";

function formatCents(c) { return `$${((c || 0) / 100).toFixed(2)}`; }

const STATUS_COLORS = {
  pending:   "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  active:    "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600 dark:text-gray-300",
  canceled:  "bg-red-100 text-red-700",
};

const GK_STATUS_COLORS = {
  page_ready:          "bg-blue-100 text-blue-700",
  guest_mode_active:   "bg-green-100 text-green-700",
  guest_mode_disabled: "bg-gray-100 text-gray-600 dark:text-gray-300",
  failed:              "bg-red-200 text-red-900",
};

const GK_STATUS_LABELS = {
  page_ready:          "Portal Ready",
  guest_mode_active:   "Guest Mode Active ✓",
  guest_mode_disabled: "Access Ended",
  failed:              "Failed",
};

// ── Stripe Payment Link Panel ─────────────────────────────────────────────
function StripePaymentPanel({ booking, onRefresh }) {
  const api = useApi();
  const [generating,    setGenerating]    = useState(false);
  const [includeDeposit, setIncludeDeposit] = useState(true);
  const [checkoutUrl,   setCheckoutUrl]   = useState(booking.stripeCheckoutUrl || "");
  const [copied,        setCopied]        = useState(false);
  const [err,           setErr]           = useState("");
  const [msg,           setMsg]           = useState("");

  const paymentStatus  = booking.paymentStatus  || "pending";
  const depositStatus  = booking.depositStatus  || "";
  const depositCents   = booking.depositAmountCents || 0;
  const totalCents     = booking.totalAmountCents   || 0;
  const hasLink        = !!checkoutUrl;
  const isPaid         = paymentStatus === "paid";

  const handleGenerate = async () => {
    setGenerating(true); setErr(""); setMsg("");
    try {
      const res = await api.post(`/admin/bookings/${booking.bookingId}/send-payment-link`, {
        include_deposit: includeDeposit,
      });
      setCheckoutUrl(res.data.checkout_url);
      setMsg(res.data.message || "Payment link generated.");
      onRefresh();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || "Failed to generate payment link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const paymentBadge = isPaid
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ Paid</span>
    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>;

  const depositBadge = depositStatus === "held"
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Deposit Held</span>
    : depositStatus === "released"
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:text-gray-400">Deposit Released</span>
    : depositStatus === "captured"
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Deposit Captured</span>
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Stripe Payment Link</h2>
        <div className="flex items-center gap-2">
          {paymentBadge}
          {depositBadge}
        </div>
      </div>

      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 dark:bg-green-900/20">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{err}</div>}

      {/* Pricing summary */}
      <div className="mb-4 text-sm text-gray-600 space-y-0.5 dark:text-gray-300">
        <div className="flex justify-between">
          <span className="text-gray-400 dark:text-gray-500">Rental total</span>
          <span className="font-medium">${((totalCents || 0) / 100).toFixed(2)}</span>
        </div>
        {depositCents > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Deposit hold</span>
            <span className="font-medium">${(depositCents / 100).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Deposit toggle — only show before link is generated */}
      {!hasLink && !isPaid && depositCents > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer select-none dark:text-gray-300">
          <input
            type="checkbox"
            checked={includeDeposit}
            onChange={e => setIncludeDeposit(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 dark:border-gray-600"
          />
          Include ${(depositCents / 100).toFixed(2)} deposit hold (placed automatically after renter pays)
        </label>
      )}

      {/* Generated link */}
      {hasLink && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1.5 dark:text-gray-400">
            {isPaid ? "Payment completed." : "Send this link to the renter — expires 24 hours after generation."}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={checkoutUrl}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-gray-50 text-gray-700 truncate dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-700"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition whitespace-nowrap dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
            >
              Open ↗
            </a>
          </div>
        </div>
      )}

      {/* Generate / Regenerate button */}
      {!isPaid && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {generating ? "Generating…" : hasLink ? "↻ Regenerate Link" : "💳 Generate Payment Link"}
        </button>
      )}

      {isPaid && booking.paymentConfirmedAt && (
        <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
          Paid {new Date(booking.paymentConfirmedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ── Mark Paid Panel (manual / off-platform payments) ─────────────────────────
function MarkPaidPanel({ booking, onRefresh }) {
  const api = useApi();
  const [marking,  setMarking]  = useState(false);
  const [method,   setMethod]   = useState(booking.paymentMethod || "bank_transfer");
  const [notes,    setNotes]    = useState("");
  const [msg,      setMsg]      = useState("");
  const [err,      setErr]      = useState("");

  const isPaid = booking.paymentStatus === "paid";

  const handleMarkPaid = async () => {
    if (!window.confirm(`Mark this booking as paid via ${method}? This records that payment has been received.`)) return;
    setMarking(true); setErr(""); setMsg("");
    try {
      await api.post(`/admin/bookings/${booking.bookingId}/mark-paid`, {
        payment_method: method,
        notes: notes || undefined,
      });
      setMsg("✓ Booking marked as paid.");
      onRefresh();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || "Failed to mark as paid");
    } finally {
      setMarking(false);
    }
  };

  const paymentBadge = isPaid
    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ Paid</span>
    : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Unpaid</span>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Payment</h2>
        {paymentBadge}
      </div>

      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 dark:bg-green-900/20">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{err}</div>}

      {/* Pricing summary */}
      <div className="mb-4 text-sm text-gray-600 space-y-0.5 dark:text-gray-300">
        <div className="flex justify-between">
          <span className="text-gray-400 dark:text-gray-500">Rental total</span>
          <span className="font-medium">{formatCents(booking.totalAmountCents)}</span>
        </div>
        {booking.depositAmountCents > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-gray-500">Deposit</span>
            <span className="font-medium">{formatCents(booking.depositAmountCents)}</span>
          </div>
        )}
      </div>

      {isPaid ? (
        <div className="text-sm text-gray-600 space-y-1 dark:text-gray-300">
          <p>
            <span className="text-gray-400 dark:text-gray-500">Method: </span>
            <span className="capitalize font-medium">{booking.paymentMethod?.replace(/_/g, " ") || "—"}</span>
          </p>
          {booking.paymentConfirmedAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Confirmed {new Date(booking.paymentConfirmedAt).toLocaleString()}
            </p>
          )}
          {booking.paymentNotes && (
            <p className="text-xs text-gray-500 italic dark:text-gray-400">"{booking.paymentNotes}"</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Payment Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="zelle">Zelle</option>
              <option value="venmo">Venmo</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={`e.g. "Received $350 via Zelle on 7/7"`}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600"
            />
          </div>
          <button
            onClick={handleMarkPaid}
            disabled={marking}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            {marking ? "Saving…" : "✓ Mark as Paid"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Contract & Documents Panel ────────────────────────────────────────────────
// (Only shown for non-Turo bookings — see Issue 4)
const CONTRACT_STATUS_LABELS = {
  not_required:      { label: "Not Required",       color: "bg-gray-100 text-gray-500 dark:text-gray-400" },
  sent:              { label: "Awaiting Signature",  color: "bg-yellow-100 text-yellow-700" },
  viewed:            { label: "Viewed",              color: "bg-blue-100 text-blue-700" },
  signed:            { label: "✓ Signed (e-sign)",   color: "bg-green-100 text-green-700" },
  signed_in_person:  { label: "✓ Signed (in person)", color: "bg-green-100 text-green-700" },
  declined:          { label: "Declined",            color: "bg-red-100 text-red-700" },
  expired:           { label: "Expired",             color: "bg-orange-100 text-orange-700" },
};

function ContractPanel({ booking, onRefresh }) {
  const api = useApi();
  const fileRef = useRef(null);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendName,  setSendName]  = useState(booking.guestName || booking.turoGuestName || "");
  const [sendEmail, setSendEmail] = useState(booking.guestEmail || booking.turoGuestEmail || "");
  const [sendMsg,   setSendMsg]   = useState("");
  const [ccAdmin,   setCcAdmin]   = useState(false);
  const [testMode,  setTestMode]  = useState(false);
  const [sending,   setSending]   = useState(false);
  const [sendResult, setSendResult] = useState("");
  const [sendErr,   setSendErr]   = useState("");

  const [docs,       setDocs]       = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState("");
  const [uploadErr,  setUploadErr]  = useState("");

  // Mark-signed state
  const [marking,   setMarking]   = useState(false);
  const [markErr,   setMarkErr]   = useState("");

  const contractStatus = booking.contractStatus || "not_required";
  const statusInfo = CONTRACT_STATUS_LABELS[contractStatus] || { label: contractStatus, color: "bg-gray-100 text-gray-500 dark:text-gray-400" };
  const isSigned = ["signed", "signed_in_person"].includes(contractStatus);

  // Load docs on mount
  useEffect(() => {
    setDocsLoading(true);
    api.get(`/admin/bookings/${booking.bookingId}/docs`)
      .then(r => setDocs(r.data?.docs || []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, [booking.bookingId]);

  const handleSendContract = async () => {
    setSending(true); setSendErr(""); setSendResult("");
    try {
      await api.post(`/admin/bookings/${booking.bookingId}/send-contract`, {
        recipient_name:  sendName,
        recipient_email: sendEmail,
        message:         sendMsg || undefined,
        cc_admin:        ccAdmin,
        test_mode:       testMode,
      });
      setSendResult(`✓ Contract sent to ${sendEmail}${testMode ? " (test mode)" : ""}`);
      setShowSendModal(false);
      onRefresh();
    } catch (e) {
      setSendErr(e.response?.data?.error || e.message || "Failed to send contract");
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr(""); setUploadMsg("");
    try {
      // 1. Get presigned URL
      const urlRes = await api.get(`/admin/bookings/${booking.bookingId}/doc-upload-urls`, {
        params: { type: "contract", filename: file.name },
      });
      const { upload_url, content_type } = urlRes.data;

      // 2. PUT directly to S3
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": content_type },
        body: file,
      });

      setUploadMsg(`✓ "${file.name}" uploaded successfully`);

      // 3. Refresh docs list
      const docsRes = await api.get(`/admin/bookings/${booking.bookingId}/docs`);
      setDocs(docsRes.data?.docs || []);
    } catch (err) {
      setUploadErr(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Issue 1: Mark-signed requires either a SignWell send OR an uploaded doc
  const canMarkSigned = contractStatus === "sent" || docs.length > 0;

  const handleMarkSigned = async () => {
    if (!window.confirm("Mark this contract as signed in person? This records that the renter has physically signed the rental agreement.")) return;
    setMarking(true); setMarkErr("");
    try {
      await api.post(`/admin/bookings/${booking.bookingId}/mark-signed`);
      onRefresh();
    } catch (e) {
      setMarkErr(e.response?.data?.error || e.message || "Failed to mark as signed");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Contract & Documents</h2>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {sendResult && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 dark:bg-green-900/20">{sendResult}</div>
      )}

      {/* ── E-Signature section ── */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 dark:text-gray-500">E-Signature (SignWell)</p>
        <div className="flex flex-wrap gap-2">
          {/* Send / Resend button */}
          {!isSigned && (
            <button
              onClick={() => { setSendErr(""); setSendResult(""); setShowSendModal(true); }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
            >
              {contractStatus === "sent" ? "✉ Resend for e-Signature" : "✉ Send for e-Signature"}
            </button>
          )}
          {contractStatus === "sent" && booking.signwellDocumentId && (
            <span className="text-xs text-gray-400 self-center dark:text-gray-500">
              Doc ID: <span className="font-mono">{booking.signwellDocumentId}</span>
            </span>
          )}
          {isSigned && (
            <span className="text-sm text-green-700 font-medium self-center">
              ✓ Signed — no action needed
            </span>
          )}
        </div>
        {contractStatus === "sent" && (
          <p className="text-xs text-gray-400 mt-1.5 dark:text-gray-500">
            Awaiting signature from {booking.guestEmail || booking.turoGuestEmail || "guest"}.
            The status will update automatically when they sign.
          </p>
        )}
      </div>

      {/* ── Send Modal ── */}
      {showSendModal && (
        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3 dark:bg-blue-900/20">
          <p className="text-sm font-semibold text-blue-800">Send Rental Agreement via SignWell</p>
          {sendErr && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-900/20">{sendErr}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1 dark:text-gray-300">Recipient Name</label>
              <input
                type="text"
                value={sendName}
                onChange={e => setSendName(e.target.value)}
                placeholder="Full name"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1 dark:text-gray-300">Recipient Email *</label>
              <input
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                placeholder="guest@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 mb-1 dark:text-gray-300">Custom Message (optional)</label>
              <textarea
                value={sendMsg}
                onChange={e => setSendMsg(e.target.value)}
                rows={2}
                placeholder="Hi [name], please sign your rental agreement…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none dark:border-gray-600"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={ccAdmin} onChange={e => setCcAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 dark:border-gray-600" />
              CC me on this
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-amber-500 dark:border-gray-600" />
              <span className="text-amber-700">Test mode (no real signature)</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSendContract}
              disabled={sending || !sendEmail}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {sending ? "Sending…" : "Send Contract"}
            </button>
            <button
              onClick={() => { setShowSendModal(false); setSendErr(""); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Document Upload section ── */}
      <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 dark:text-gray-500">
          Upload Signed Document
        </p>
        <p className="text-xs text-gray-400 mb-3 dark:text-gray-500">
          Upload a photo or scan of a hand-signed contract, receipt, or other document.
          Accepted: JPG, PNG, PDF, HEIC.
        </p>

        {uploadMsg && (
          <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 dark:bg-green-900/20">{uploadMsg}</div>
        )}
        {uploadErr && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-900/20">{uploadErr}</div>
        )}

        <div className="flex items-center gap-3">
          <label className={`cursor-pointer px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Uploading…" : "📎 Choose File"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.heic"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {uploading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
          )}
        </div>

        {/* Uploaded docs list */}
        {docsLoading ? (
          <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">Loading documents…</p>
        ) : docs.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-gray-500 font-medium dark:text-gray-400">Uploaded Documents</p>
            {docs.map(doc => (
              <div key={doc.s3_key} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 dark:bg-gray-900/40">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{doc.filename}</span>
                  <span className="ml-2 text-gray-400 capitalize dark:text-gray-500">[{doc.type}]</span>
                  {doc.size > 0 && (
                    <span className="ml-2 text-gray-400 dark:text-gray-500">{(doc.size / 1024).toFixed(0)} KB</span>
                  )}
                </div>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline ml-3"
                >
                  View ↗
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">No documents uploaded yet.</p>
        )}
      </div>

      {/* ── Mark Signed In Person ── */}
      {/* Issue 1: Only enabled after a doc is uploaded OR contract was sent via SignWell */}
      {!isSigned && (
        <div className="border-t border-gray-100 pt-4 mt-4 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 dark:text-gray-500">
            Mark as Signed In Person
          </p>
          {canMarkSigned ? (
            <div className="flex flex-col gap-1">
              <button
                onClick={handleMarkSigned}
                disabled={marking}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition w-fit"
              >
                {marking ? "Saving…" : "✓ Mark as Signed In Person"}
              </button>
              {markErr && <span className="text-xs text-red-600">{markErr}</span>}
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              ⚠ To mark as signed, you must first either:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Send the contract for e-signature via SignWell (above), <strong>or</strong></li>
                <li>Upload a photo/scan of the signed contract (above)</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers for datetime-local inputs ────────────────────────────────────────

function toDatetimeLocal(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "-" +
      pad(d.getMonth() + 1) + "-" +
      pad(d.getDate()) + "T" +
      pad(d.getHours()) + ":" +
      pad(d.getMinutes())
    );
  } catch { return ""; }
}

function fromDatetimeLocal(val) {
  if (!val) return "";
  return new Date(val).toISOString();
}

// ── Guest Key Panel ────────────────────────────────────────────────────────────
function GuestKeyPanel({ booking, onRefresh }) {
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");
  const [err, setErr]         = useState("");
  const [copied, setCopied]   = useState(false);

  const gkStatus          = booking.guestKeyStatus || "";
  const createdAt         = booking.guestKeyCreatedAt || "";
  const enabledAt         = booking.guestModeEnabledAt || booking.guestKeyActivatedAt || "";
  const disabledAt        = booking.guestModeDisabledAt || booking.guestKeyRevokedAt || "";
  const schedActivateAt   = booking.guestKeyActivateAt || "";
  const schedRevokeAt     = booking.guestKeyRevokeAt || "";
  const activatedAt       = booking.guestKeyActivatedAt || "";
  const revokedAt         = booking.guestKeyRevokedAt || "";
  const eraseStatus       = booking.eraseUserDataStatus || "";
  const eraseAt           = booking.eraseUserDataAt || "";
  const guestModeCmd      = booking.guestModeCommandStatus || "";
  const isTesla           = booking.teslaEnabled || booking.vin?.startsWith("5YJ") || booking.vin?.startsWith("7SA");
  const portalUrl         = normalisePortalUrl(booking.guestAccessUrl || booking.guestKeyLink);

  const callAction = useCallback(async (action, body = {}) => {
    setLoading(true);
    setMsg(""); setErr("");
    try {
      const endpoint = `/admin/guest-keys/${booking.bookingId}/${action}`;
      if (action === "reschedule") {
        await api.put(endpoint, body);
      } else {
        await api.post(endpoint, body);
      }
      setMsg(`✓ ${action} completed successfully`);
      onRefresh();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || `${action} failed`);
    } finally {
      setLoading(false);
    }
  }, [booking.bookingId, api, onRefresh]);

  if (!isTesla) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-gray-400">Tesla Guest Key</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">Not applicable — this vehicle is not Tesla-enabled.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Tesla Guest Key</h2>
        <div className="flex items-center gap-2">
          {gkStatus && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${GK_STATUS_COLORS[gkStatus] || "bg-gray-100 text-gray-600 dark:text-gray-300"}`}>
              {GK_STATUS_LABELS[gkStatus] || gkStatus}
            </span>
          )}
          {portalUrl && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(portalUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              title="Copy guest portal link"
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {copied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
          )}
          {portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Open Portal ↗
            </a>
          )}
        </div>
      </div>

      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 dark:bg-green-900/20">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{err}</div>}

      {/* E2 — Key lifecycle timeline */}
      {gkStatus && (
        <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
          {createdAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">Portal Created</dt>
              <dd className="text-xs">{new Date(createdAt).toLocaleString()}</dd>
            </div>
          )}
          {schedActivateAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">⏰ Scheduled Activate</dt>
              <dd className="text-xs">{new Date(schedActivateAt).toLocaleString()}</dd>
            </div>
          )}
          {schedRevokeAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">⏰ Scheduled Revoke</dt>
              <dd className="text-xs">{new Date(schedRevokeAt).toLocaleString()}</dd>
            </div>
          )}
          {enabledAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">✅ Guest Mode Enabled</dt>
              <dd className="text-xs font-medium text-green-700">{new Date(enabledAt).toLocaleString()}</dd>
            </div>
          )}
          {disabledAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">🔒 Guest Mode Disabled</dt>
              <dd className="text-xs font-medium text-gray-600 dark:text-gray-300">{new Date(disabledAt).toLocaleString()}</dd>
            </div>
          )}
          {activatedAt && !enabledAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">Activated</dt>
              <dd className="text-xs">{new Date(activatedAt).toLocaleString()}</dd>
            </div>
          )}
          {revokedAt && !disabledAt && (
            <div>
              <dt className="text-gray-400 text-xs dark:text-gray-500">Revoked</dt>
              <dd className="text-xs">{new Date(revokedAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>
      )}

      {/* ── Guest Mode Controls ── */}
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">
          Guest Mode Controls
        </p>
        <div className="flex flex-wrap gap-2">

          {/* Enable Guest Mode */}
          <button
            onClick={() => {
              if (window.confirm("Enable Guest Mode now? This will POST /command/guest_mode {enable: true} to the vehicle immediately.")) {
                callAction("enable-guest-mode");
              }
            }}
            disabled={loading || gkStatus === "guest_mode_active"}
            title={gkStatus === "guest_mode_active" ? "Guest Mode is already active" : "Enable Guest Mode immediately (admin override)"}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Working…" : "⚡ Enable Guest Mode"}
          </button>

          {/* Disable Guest Mode */}
          <button
            onClick={() => {
              if (window.confirm("Disable Guest Mode now? This will immediately revoke the renter's remote app access.")) {
                callAction("disable-guest-mode");
              }
            }}
            disabled={loading || gkStatus === "guest_mode_disabled"}
            title={gkStatus === "guest_mode_disabled" ? "Guest Mode is already disabled" : "Disable Guest Mode immediately (admin override)"}
            className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Working…" : "🔒 Disable Guest Mode"}
          </button>

          {/* Erase Renter Data */}
          <button
            onClick={() => {
              if (window.confirm("Erase renter data from the vehicle? This will wipe Spotify, saved addresses, and Bluetooth pairings from the car's local storage. This cannot be undone.")) {
                callAction("erase-user-data");
              }
            }}
            disabled={loading}
            title="POST /command/erase_user_data — wipes Spotify, maps, Bluetooth from car hardware"
            className="px-3 py-1.5 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800 disabled:opacity-40"
          >
            {loading ? "Working…" : "🗑 Erase Renter Data"}
          </button>

          {/* Revoke Drivers */}
          <button
            onClick={() => {
              if (window.confirm("Revoke all guest drivers from the vehicle? This calls DELETE /vehicles/{vin}/drivers and removes any phone keys paired via the Guest Mode QR code. The renter will lose Bluetooth key access immediately.")) {
                callAction("revoke-drivers");
              }
            }}
            disabled={loading}
            title="DELETE /vehicles/{vin}/drivers — removes all non-owner phone keys from the vehicle"
            className="px-3 py-1.5 bg-purple-700 text-white text-sm rounded-lg hover:bg-purple-800 disabled:opacity-40"
          >
            {loading ? "Working…" : "🔑 Revoke Drivers"}
          </button>

          {/* Send SMS — manual trigger (auto-send disabled during testing) */}
          {portalUrl && (
            <button
              onClick={() => {
                if (window.confirm("Send an SMS to the renter with the guest portal link? Make sure the booking has a phone number on file.")) {
                  callAction("send-sms");
                }
              }}
              disabled={loading}
              title="Manually send the portal URL to the renter via SMS"
              className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40"
            >
              {loading ? "Working…" : "📱 Send SMS"}
            </button>
          )}

        </div>
        <p className="text-xs text-gray-400 mt-2 dark:text-gray-500">
          These controls bypass the automated schedule. Use for manual intervention only.
        </p>

        {/* ── Per-action status indicators ── */}
        {/* Only show guestModeCmd badge when it's "failed" — if guest mode is now
            active/disabled the status badge above already reflects the outcome,
            so showing a stale "failed" label alongside "Guest Mode Active ✓" is
            confusing. We suppress it once the command has clearly succeeded. */}
        {(eraseStatus || (guestModeCmd && guestModeCmd === "failed" && gkStatus !== "guest_mode_active" && gkStatus !== "guest_mode_disabled")) && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 text-xs dark:border-gray-700">
            {eraseStatus && (
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${
                eraseStatus === "erased"  ? "bg-green-100 text-green-700" :
                eraseStatus === "failed"  ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600 dark:text-gray-300"
              }`}>
                🗑 Erase: {eraseStatus === "erased" ? `✓ Done${eraseAt ? ` (${new Date(eraseAt).toLocaleString()})` : ""}` : eraseStatus}
              </span>
            )}
            {guestModeCmd && guestModeCmd === "failed" && gkStatus !== "guest_mode_active" && gkStatus !== "guest_mode_disabled" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                ⚡ Guest Mode cmd: failed — retry above
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Booking Readiness Banner ───────────────────────────────────────────────────
// Shows a warning if a private/admin booking is confirmed but not yet paid or signed.
function ReadinessBanner({ booking }) {
  const source = booking.source || "private";
  // Only show for non-Turo bookings
  if (source === "turo") return null;
  // Only show for active/confirmed bookings
  if (!["confirmed", "active"].includes(booking.status)) return null;

  const isPaid   = booking.paymentStatus === "paid";
  const isSigned = ["signed", "signed_in_person"].includes(booking.contractStatus);
  // If contract is "not_required" treat it as satisfied
  const contractRequired = booking.contractStatus !== "not_required";
  const contractOk = !contractRequired || isSigned;

  if (isPaid && contractOk) return null;

  const issues = [];
  if (!isPaid) issues.push("payment has not been confirmed");
  if (!contractOk) issues.push("contract has not been signed");

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
      <span className="text-amber-500 text-lg mt-0.5">⚠</span>
      <div>
        <p className="text-sm font-semibold text-amber-800">Booking not yet ready</p>
        <p className="text-xs text-amber-700 mt-0.5">
          This booking is <strong>{booking.status}</strong> but {issues.join(" and ")}.
          The booking should not be considered valid until both payment is confirmed and the contract is signed.
        </p>
        <div className="flex gap-4 mt-2 text-xs">
          <span className={isPaid ? "text-green-700" : "text-red-600"}>
            {isPaid ? "✓ Paid" : "✗ Not Paid"}
          </span>
          <span className={isSigned ? "text-green-700" : contractRequired ? "text-red-600" : "text-gray-500 dark:text-gray-400"}>
            {isSigned ? "✓ Contract Signed" : contractRequired ? "✗ Contract Not Signed" : "— Not Required"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminBookingDetail() {
  const { id } = useParams();
  const api    = useApi();

  const [booking, setBooking]         = useState(null);
  const [inspections, setInspections] = useState([]);
  const [vehicleMap, setVehicleMap]   = useState({});
  const [loading, setLoading]         = useState(true);
  const [actionMsg, setActionMsg]     = useState("");
  const [actionErr, setActionErr]     = useState("");

  // Adjust booking times (inline in Rental Info card)
  const [showAdjust,  setShowAdjust]  = useState(false);
  const [adjStart,    setAdjStart]    = useState("");
  const [adjEnd,      setAdjEnd]      = useState("");
  const [adjLoading,  setAdjLoading]  = useState(false);
  const [adjMsg,      setAdjMsg]      = useState("");
  const [adjErr,      setAdjErr]      = useState("");

  // E1/E3: Edit Booking panel state
  const [showEdit,      setShowEdit]      = useState(false);
  const [editName,      setEditName]      = useState("");
  const [editPhone,     setEditPhone]     = useState("");
  const [editEmail,     setEditEmail]     = useState("");
  const [editTotal,     setEditTotal]     = useState("");
  const [editNotes,     setEditNotes]     = useState("");
  const [editPayMethod, setEditPayMethod] = useState("");
  const [editSaving,    setEditSaving]    = useState(false);
  const [editMsg,       setEditMsg]       = useState("");
  const [editErr,       setEditErr]       = useState("");

  // Fetch vehicles once for display name lookup
  useEffect(() => {
    api.get("/admin/vehicles")
      .then(r => {
        const map = {};
        (r.data || []).forEach(v => {
          map[v.vin] = `${v.year} ${v.make} ${v.model}`.trim();
        });
        setVehicleMap(map);
      })
      .catch(console.error);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/admin/bookings/${id}`),
      api.get(`/admin/bookings/${id}/inspections`),
    ])
      .then(([bRes, iRes]) => {
        setBooking(bRes.data);
        setInspections(iRes.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, api]);

  useEffect(() => { reload(); }, [reload]);

  const doAction = async (endpoint, label, body = {}) => {
    setActionMsg(""); setActionErr("");
    try {
      await api.post(endpoint, body);
      setActionMsg(`${label} successful.`);
      reload();
    } catch (e) {
      setActionErr(e.response?.data?.error || `${label} failed.`);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );
  if (!booking) return (
    <div className="min-h-screen flex items-center justify-center text-red-600">Booking not found</div>
  );

  const preTrip  = inspections.find(i => i.type === "pre_trip");
  const postTrip = inspections.find(i => i.type === "post_trip");
  const isTuro   = booking.source === "turo";

  // Determine which payment panel to show
  // - Turo: no payment panel
  // - stripe_payment_link: StripePaymentPanel
  // - everything else (admin/private manual): MarkPaidPanel
  const showStripePanel = !isTuro && booking.paymentMethod === "stripe_payment_link";
  const showMarkPaidPanel = !isTuro && booking.paymentMethod !== "stripe_payment_link";

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to="/bookings" className="text-sm text-blue-600 hover:underline">← Back to Bookings</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1 dark:text-gray-100">Booking Detail</h1>
            <p className="text-gray-400 text-xs font-mono dark:text-gray-500">{id}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Issue 4: Print Contract only for non-Turo bookings */}
            {!isTuro && (
              <a
                href={`/admin/bookings/${id}/print-contract`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
                title="Open printable rental agreement in new tab"
              >
                🖨 Print Contract
              </a>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[booking.status] || ""}`}>
              {booking.status}
            </span>
          </div>
        </div>

        {/* Issue 2: Booking readiness banner for non-Turo bookings */}
        <ReadinessBanner booking={booking} />

        {actionMsg && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 dark:bg-green-900/20">{actionMsg}</div>
        )}
        {actionErr && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20">{actionErr}</div>
        )}

        {/* Booking info — with inline Adjust Times */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Rental Info</h2>
            {!showAdjust && (
              <button
                onClick={() => {
                  setAdjStart(toDatetimeLocal(booking.startTime));
                  setAdjEnd(toDatetimeLocal(booking.endTime));
                  setAdjErr(""); setAdjMsg("");
                  setShowAdjust(true);
                }}
                className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded-lg hover:bg-yellow-600 transition"
              >
                ⏰ Adjust Times
              </button>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Vehicle</dt>
              <dd className="font-medium">{vehicleMap[booking.vin] || booking.vin || "—"}</dd>
              {booking.vin && vehicleMap[booking.vin] && (
                <dd className="text-xs text-gray-400 font-mono mt-0.5 dark:text-gray-500">{booking.vin}</dd>
              )}
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Guest / User</dt>
              <dd className="font-mono text-xs">
                {booking.guestName || booking.turoGuestName || booking.userId || "—"}
              </dd>
            </div>
            <div><dt className="text-gray-400 dark:text-gray-500">Start</dt><dd>{new Date(booking.startTime).toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 dark:text-gray-500">End</dt><dd>{new Date(booking.endTime).toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 dark:text-gray-500">Total</dt><dd className="font-medium">{formatCents(booking.totalAmountCents)}</dd></div>
            <div><dt className="text-gray-400 dark:text-gray-500">Deposit</dt><dd>{formatCents(booking.depositAmountCents)}</dd></div>
            <div><dt className="text-gray-400 dark:text-gray-500">Source</dt><dd className="capitalize">{booking.source || "private"}</dd></div>
            <div><dt className="text-gray-400 dark:text-gray-500">Contract</dt><dd className="capitalize">{booking.contractStatus || "—"}</dd></div>
            {booking.source === "turo" && (booking.turoTripId || booking.turoTripUrl) && (
              <div className="col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Turo Reservation</dt>
                <dd className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                    #{booking.turoTripId || booking.turoTripUrl?.split("/").pop()}
                  </span>
                  <a
                    href={booking.turoTripUrl || `https://turo.com/reservation/${booking.turoTripId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    View on Turo ↗
                  </a>
                </dd>
              </div>
            )}
            {(booking.guestEmail || booking.turoGuestEmail) && (
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Guest Email</dt>
                <dd className="text-xs">{booking.guestEmail || booking.turoGuestEmail}</dd>
              </div>
            )}
            {(booking.guestPhone || booking.turoGuestPhone) && (
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Guest Phone</dt>
                <dd className="text-xs font-mono">
                  <a
                    href={`tel:${booking.guestPhone || booking.turoGuestPhone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {booking.guestPhone || booking.turoGuestPhone}
                  </a>
                </dd>
              </div>
            )}
            {!(booking.guestPhone || booking.turoGuestPhone) && (
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Guest Phone</dt>
                <dd className="text-xs text-amber-600 italic">⚠ No phone number on file — SMS will fail</dd>
              </div>
            )}
          </dl>

          {/* Inline adjust-times form */}
          {showAdjust && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 dark:border-gray-700">
              {adjMsg && <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 dark:bg-green-900/20">{adjMsg}</div>}
              {adjErr && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-900/20">{adjErr}</div>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">New Start Time</label>
                  <input
                    type="datetime-local"
                    value={adjStart}
                    onChange={e => setAdjStart(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">New End Time</label>
                  <input
                    type="datetime-local"
                    value={adjEnd}
                    onChange={e => setAdjEnd(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:border-gray-600"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!adjStart || !adjEnd) { setAdjErr("Both times are required."); return; }
                    setAdjLoading(true); setAdjErr(""); setAdjMsg("");
                    try {
                      await api.put(`/admin/guest-keys/${booking.bookingId}/reschedule`, {
                        start_time: fromDatetimeLocal(adjStart),
                        end_time:   fromDatetimeLocal(adjEnd),
                      });
                      setAdjMsg("✓ Times updated.");
                      setShowAdjust(false);
                      reload();
                    } catch (e) {
                      setAdjErr(e.response?.data?.error || e.message || "Failed to update times");
                    } finally {
                      setAdjLoading(false);
                    }
                  }}
                  disabled={adjLoading}
                  className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                >
                  {adjLoading ? "Saving…" : "Apply"}
                </button>
                <button
                  onClick={() => { setShowAdjust(false); setAdjErr(""); }}
                  className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* E1/E3: Edit Booking Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Edit Booking</h2>
            {!showEdit && (
              <button
                onClick={() => {
                  setEditName(booking.guestName || booking.turoGuestName || "");
                  setEditPhone(booking.guestPhone || booking.turoGuestPhone || "");
                  setEditEmail(booking.guestEmail || booking.turoGuestEmail || "");
                  setEditTotal(booking.totalAmountCents != null ? String(Math.round(booking.totalAmountCents / 100 * 100) / 100) : "");
                  setEditNotes(booking.notes || "");
                  setEditPayMethod(booking.paymentMethod || "");
                  setEditMsg(""); setEditErr("");
                  setShowEdit(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                ✏ Edit
              </button>
            )}
          </div>

          {!showEdit ? (
            <dl className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div><dt className="text-gray-400 dark:text-gray-500">Guest Name</dt><dd>{booking.guestName || booking.turoGuestName || <span className="italic text-gray-300">—</span>}</dd></div>
              <div><dt className="text-gray-400 dark:text-gray-500">Guest Phone</dt><dd>{booking.guestPhone || booking.turoGuestPhone || <span className="italic text-amber-500 text-xs">⚠ missing</span>}</dd></div>
              <div><dt className="text-gray-400 dark:text-gray-500">Guest Email</dt><dd className="text-xs">{booking.guestEmail || booking.turoGuestEmail || <span className="italic text-gray-300">—</span>}</dd></div>
              <div><dt className="text-gray-400 dark:text-gray-500">Total</dt><dd className="font-medium">{formatCents(booking.totalAmountCents)}</dd></div>
              <div><dt className="text-gray-400 dark:text-gray-500">Payment Method</dt><dd className="capitalize">{(booking.paymentMethod || "—").replace(/_/g, " ")}</dd></div>
              <div className="col-span-2"><dt className="text-gray-400 dark:text-gray-500">Notes</dt><dd className="text-xs">{booking.notes || <span className="italic text-gray-300">—</span>}</dd></div>
            </dl>
          ) : (
            <div className="space-y-3">
              {editMsg && <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 dark:bg-green-900/20">{editMsg}</div>}
              {editErr && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-900/20">{editErr}</div>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Guest Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="Full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Guest Phone</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Guest Email</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Total Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={editTotal} onChange={e => setEditTotal(e.target.value)}
                    placeholder="e.g. 350.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Payment Method</label>
                  <select value={editPayMethod} onChange={e => setEditPayMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600">
                    <option value="">— unchanged —</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="zelle">Zelle</option>
                    <option value="venmo">Venmo</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="stripe_payment_link">Stripe Payment Link</option>
                    <option value="turo">Turo</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Notes</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    rows={2} placeholder="Internal notes about this booking…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none dark:border-gray-600" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={editSaving}
                  onClick={async () => {
                    setEditSaving(true); setEditMsg(""); setEditErr("");
                    const payload = {};
                    if (editName.trim())  payload.guestName  = editName.trim();
                    if (editPhone.trim()) payload.guestPhone = editPhone.trim();
                    if (editEmail.trim()) payload.guestEmail = editEmail.trim();
                    if (editTotal !== "") {
                      const cents = Math.round(parseFloat(editTotal) * 100);
                      if (isNaN(cents) || cents < 0) { setEditErr("Invalid total amount."); setEditSaving(false); return; }
                      payload.totalAmountCents = cents;
                    }
                    if (editNotes !== booking.notes) payload.notes = editNotes;
                    if (editPayMethod) payload.paymentMethod = editPayMethod;
                    if (!Object.keys(payload).length) { setEditErr("No changes to save."); setEditSaving(false); return; }
                    try {
                      await api.put(`/admin/bookings/${booking.bookingId}`, payload);
                      setEditMsg("✓ Booking updated.");
                      setShowEdit(false);
                      reload();
                    } catch (e) {
                      setEditErr(e.response?.data?.error || e.message || "Save failed.");
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => { setShowEdit(false); setEditErr(""); setEditMsg(""); }}
                  className="px-4 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Admin actions */}
        {/* Issue 5: Check-in / deposit actions hidden for Turo bookings */}
        {!isTuro && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 dark:text-gray-400">Actions</h2>
            <div className="flex flex-wrap gap-3">
              {!preTrip && booking.status === "confirmed" && (
                <Link to={`/bookings/${id}/check-in`}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                  Check In
                </Link>
              )}
              {preTrip && !postTrip && booking.status === "active" && (
                <Link to={`/bookings/${id}/check-out`}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition">
                  Check Out
                </Link>
              )}
              {booking.status === "active" && (
                <button
                  onClick={() => doAction(`/admin/bookings/${id}/capture-deposit`, "Capture deposit")}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
                  Capture Deposit
                </button>
              )}
              {["confirmed", "active"].includes(booking.status) && (
                <button
                  onClick={() => doAction(`/admin/bookings/${id}/release-deposit`, "Release deposit")}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
                  Release Deposit
                </button>
              )}
            </div>
          </div>
        )}

        {/* Issue 2: Payment panels */}
        {showStripePanel && (
          <StripePaymentPanel booking={booking} onRefresh={reload} />
        )}
        {showMarkPaidPanel && (
          <MarkPaidPanel booking={booking} onRefresh={reload} />
        )}

        {/* Issue 4: Contract panel — only for non-Turo bookings */}
        {!isTuro && (
          <ContractPanel booking={booking} onRefresh={reload} />
        )}

        {/* Tesla Guest Key Panel */}
        <GuestKeyPanel booking={booking} onRefresh={reload} />

        {/* Inspections */}
        {(preTrip || postTrip) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 dark:text-gray-400">Inspections</h2>
            <div className="space-y-4">
              {[preTrip, postTrip].filter(Boolean).map(insp => (
                <div key={insp.type} className="border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                  <h3 className="font-medium text-gray-800 mb-3 dark:text-gray-100">
                    {insp.type === "pre_trip" ? "🔍 Pre-Trip" : "✅ Post-Trip"} — {new Date(insp.completedAt).toLocaleString()}
                  </h3>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-gray-400 dark:text-gray-500">Mileage</dt><dd>{insp.mileage?.toLocaleString()} mi</dd></div>
                    <div><dt className="text-gray-400 dark:text-gray-500">Battery/Fuel</dt><dd>{insp.fuelOrBatteryPct}%</dd></div>
                    <div><dt className="text-gray-400 dark:text-gray-500">Exterior</dt><dd className="capitalize">{insp.exteriorCondition?.replace("_", " ")}</dd></div>
                    <div><dt className="text-gray-400 dark:text-gray-500">Interior</dt><dd className="capitalize">{insp.interiorCondition?.replace("_", " ")}</dd></div>
                    {insp.tirePressures && (
                      <div className="col-span-2">
                        <dt className="text-gray-400 dark:text-gray-500">Tire PSI</dt>
                        <dd>FL:{insp.tirePressures.fl} FR:{insp.tirePressures.fr} RL:{insp.tirePressures.rl} RR:{insp.tirePressures.rr}</dd>
                      </div>
                    )}
                  </dl>
                  {insp.damageNotes && <p className="mt-2 text-sm text-red-600">⚠ {insp.damageNotes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
