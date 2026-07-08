/**
 * AdminPrintContract.jsx
 * Renders a printable rental agreement using the Drive Dobias LLC contract layout.
 * Accessed via /admin/bookings/print-contract?... (from create form)
 *            or /admin/bookings/:id/print-contract   (from booking detail — confirmed, no watermark)
 *
 * URL params (from create form draft):
 *   draft, vin, vehicleName, startTime, endTime, totalCents, dailyRateCents, numDays,
 *   guestName, guestPhone, guestEmail, guestAddress, guestCity, guestDOB,
 *   guestDLNum, guestDLState, guestDLExp,
 *   addlName, addlAddress, addlDLNum, addlDLState, addlDLExp, addlDOB,
 *   purpose, notes, pickupLocation, paymentMethod, bookingId
 *
 * When loaded from /admin/bookings/:id/print-contract the booking data is fetched
 * from the API and the draft watermark is suppressed.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../context/AuthContext";

function fmt(cents) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDateOnly(iso) {
  if (!iso) return "";
  try {
    // Handle plain date strings like "1990-01-15"
    const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

export default function AdminPrintContract() {
  const { id: bookingIdFromRoute } = useParams(); // present when loaded from /bookings/:id/print-contract
  const [searchParams] = useSearchParams();
  const api = useApi();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (bookingIdFromRoute) {
      // Fetch confirmed booking from API — no draft watermark
      api.get(`/admin/bookings/${bookingIdFromRoute}`)
        .then(async r => {
          const b = r.data;
          const vin = b.vin || "";

          // Also fetch vehicle data to get name and freeMilesPerDay
          let vehicleName = b.vehicleName || "";
          let freeMilesPerDay = b.freeMilesPerDay || "";
          if (vin && !vehicleName) {
            try {
              const vRes = await api.get(`/admin/vehicles/${vin}`);
              const v = vRes.data;
              vehicleName = [v.year, v.make, v.model].filter(Boolean).join(" ");
              freeMilesPerDay = v.freeMilesPerDay || "";
            } catch (_) { /* non-fatal */ }
          }

          setData({
            isDraft:      false,
            bookingId:    b.bookingId || bookingIdFromRoute,
            vin,
            vehicleName,
            freeMilesPerDay,
            startTime:    b.startTime || "",
            endTime:      b.endTime || "",
            totalCents:   b.totalAmountCents || 0,
            dailyRateCents: b.dailyRateCents || 0,
            numDays:      b.numDays || 0,
            depositCents: b.depositAmountCents || 0,
            guestName:    b.guestName || "",
            guestPhone:   b.guestPhone || "",
            guestEmail:   b.guestEmail || "",
            guestAddress: b.guestAddress || "",
            guestCity:    b.guestCity || "",
            guestDOB:     b.guestDOB || "",
            guestDLNum:   b.guestDLNum || "",
            guestDLState: b.guestDLState || "",
            guestDLExp:   b.guestDLExp || "",
            addlName:     b.addlDriverName || "",
            addlAddress:  b.addlDriverAddress || "",
            addlDLNum:    b.addlDriverDLNum || "",
            addlDLState:  b.addlDriverDLState || "",
            addlDLExp:    b.addlDriverDLExp || "",
            addlDOB:      b.addlDriverDOB || "",
            purpose:      b.purpose || "",
            notes:        b.notes || "",
            pickupLocation: b.pickupLocation || "",
            paymentMethod:  b.paymentMethod || "",
          });
        })
        .catch(e => setError(e.message || "Failed to load booking"))
        .finally(() => setLoading(false));
    } else {
      // Load from URL params (draft preview from create form)
      const p = searchParams;
      setData({
        isDraft:       p.get("draft") !== "0",
        bookingId:     p.get("bookingId") || "DRAFT",
        vin:           p.get("vin") || "",
        vehicleName:   p.get("vehicleName") || "",
        startTime:     p.get("startTime") || "",
        endTime:       p.get("endTime") || "",
        totalCents:    parseInt(p.get("totalCents") || "0", 10),
        dailyRateCents:parseInt(p.get("dailyRateCents") || "0", 10),
        numDays:       parseInt(p.get("numDays") || "0", 10),
        depositCents:  parseInt(p.get("depositCents") || "0", 10),
        guestName:     p.get("guestName") || "",
        guestPhone:    p.get("guestPhone") || "",
        guestEmail:    p.get("guestEmail") || "",
        guestAddress:  p.get("guestAddress") || "",
        guestCity:     p.get("guestCity") || "",
        guestDOB:      p.get("guestDOB") || "",
        guestDLNum:    p.get("guestDLNum") || "",
        guestDLState:  p.get("guestDLState") || "",
        guestDLExp:    p.get("guestDLExp") || "",
        addlName:      p.get("addlName") || "",
        addlAddress:   p.get("addlAddress") || "",
        addlDLNum:     p.get("addlDLNum") || "",
        addlDLState:   p.get("addlDLState") || "",
        addlDLExp:     p.get("addlDLExp") || "",
        addlDOB:       p.get("addlDOB") || "",
        purpose:       p.get("purpose") || "",
        notes:         p.get("notes") || "",
        pickupLocation:p.get("pickupLocation") || "",
        paymentMethod: p.get("paymentMethod") || "",
      });
      setLoading(false);
    }
  }, [bookingIdFromRoute]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
      Loading contract…
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "red" }}>
      Error: {error}
    </div>
  );
  if (!data) return null;

  const {
    isDraft, bookingId, vin, vehicleName, freeMilesPerDay,
    startTime, endTime, totalCents, dailyRateCents, numDays, depositCents,
    guestName, guestPhone, guestEmail, guestAddress, guestCity,
    guestDOB, guestDLNum, guestDLState, guestDLExp,
    addlName, addlAddress, addlDLNum, addlDLState, addlDLExp, addlDOB,
    purpose, notes, pickupLocation,
  } = data;

  const contractNum = bookingId || "DRAFT";
  const logoSrc = "/drive-dobias-logo.png";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #333333;
          line-height: 1.35;
          margin: 0;
          padding: 0;
          font-size: 10.5px;
          background: #e5e7eb;
        }
        .page {
          width: 8.5in;
          min-height: 11in;
          padding: 0.4in 0.5in 0.5in 0.5in;
          margin: 0 auto 0.5in auto;
          box-sizing: border-box;
          page-break-after: always;
          position: relative;
          background-color: #ffffff;
        }
        @media print {
          body { background: white; }
          .page { margin: 0 auto; box-shadow: none; }
        }
        .header {
          text-align: center;
          margin-bottom: 12px;
          border-bottom: 2px solid #000000;
          padding-bottom: 8px;
        }
        .logo { max-height: 55px; margin-bottom: 5px; }
        .company-name {
          font-size: 22px; font-weight: bold;
          letter-spacing: 1px; margin: 0; text-transform: uppercase;
        }
        .company-contact { font-size: 10px; color: #666666; margin: 3px 0; }
        .contract-title {
          font-size: 11px; font-weight: bold;
          margin: 5px 0 0 0; letter-spacing: 0.5px;
        }
        .section-title {
          font-size: 10.5px; font-weight: bold; text-transform: uppercase;
          background-color: #f2f2f2; padding: 3px 6px;
          margin: 10px 0 5px 0; border-left: 3px solid #333333;
        }
        .grid-container {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 6px; margin-bottom: 8px;
        }
        .grid-item { border-bottom: 1px solid #cccccc; padding-bottom: 1px; }
        .grid-item.span-2 { grid-column: span 2; }
        .grid-item.span-4 { grid-column: span 4; }
        .label {
          font-size: 8px; text-transform: uppercase;
          color: #666666; font-weight: bold; margin-bottom: 1px;
        }
        .value { font-size: 10.5px; min-height: 13px; }
        .legal-text { font-size: 9.5px; text-align: justify; margin-bottom: 8px; }
        .italic-block {
          font-style: italic; padding: 5px 10px;
          border-left: 2px solid #666666;
          background-color: #fafafa; margin: 6px 0;
        }
        ul { margin: 4px 0 8px 0; padding-left: 18px; }
        li { margin-bottom: 3px; }
        ol { margin: 4px 0 8px 0; padding-left: 15px; }
        ol li { margin-bottom: 4px; text-align: justify; }
        table {
          width: 100%; border-collapse: collapse;
          margin-top: 4px; font-size: 9.5px;
        }
        th, td { border: 1px solid #cccccc; padding: 4px 6px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .checkbox-group {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 6px; margin: 6px 0;
        }
        .checkbox-item { display: flex; align-items: center; }
        .checkbox-box {
          width: 10px; height: 10px;
          border: 1px solid #333333; margin-right: 6px; flex-shrink: 0;
        }
        .signature-container {
          display: grid; grid-template-columns: 3fr 1fr;
          gap: 15px; margin-top: 10px;
        }
        .sig-block { display: flex; flex-direction: column; }
        .sig-space { min-height: 48px; border-bottom: 1px solid #333333; }
        .sig-caption {
          font-size: 8px; text-transform: uppercase;
          color: #666666; font-weight: bold; margin-top: 2px;
        }
        .footer {
          position: absolute; bottom: 0.4in; left: 0.5in; right: 0.5in;
          border-top: 1px solid #cccccc; padding-top: 4px;
          font-size: 8px; color: #888888;
          display: flex; justify-content: space-between;
        }
        .draft-banner {
          background: #fef3c7; border: 2px solid #f59e0b;
          color: #92400e; text-align: center;
          padding: 8px; font-weight: bold; font-size: 11px;
          margin-bottom: 10px; letter-spacing: 1px;
        }
      `}</style>

      {/* Screen-only print button */}
      <div className="no-print" style={{
        position: "fixed", top: 12, right: 16, zIndex: 9999,
        display: "flex", gap: 8,
      }}>
        <button
          onClick={() => window.print()}
          style={{
            background: "#2563eb", color: "white", border: "none",
            borderRadius: 8, padding: "8px 18px", fontSize: 13,
            fontWeight: 600, cursor: "pointer",
          }}
        >
          🖨 Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            background: "#6b7280", color: "white", border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 13,
            fontWeight: 600, cursor: "pointer",
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── PAGE 1 ── */}
      <div className="page">
        {isDraft && (
          <div className="draft-banner">⚠ DRAFT — NOT YET CONFIRMED — FOR REVIEW ONLY</div>
        )}

        <div className="header">
          <img className="logo" src={logoSrc} alt="Drive Dobias LLC Logo" />
          <div className="company-name">Drive Dobias LLC</div>
          <div className="company-contact">Muskego, WI &bull; dobiasllc@gmail.com &bull; drivedobias.com</div>
          <div className="contract-title">
            PRIVATE VEHICLE RENTAL AGREEMENT &bull; CONTRACT #: {contractNum}
          </div>
        </div>

        <div className="section-title">Contract Information</div>
        <div className="grid-container">
          <div className="grid-item span-2">
            <div className="label">Vehicle Asset</div>
            <div className="value">{vehicleName}</div>
          </div>
          <div className="grid-item span-2">
            <div className="label">Vehicle Identification Number (VIN)</div>
            <div className="value">{vin}</div>
          </div>
          <div className="grid-item">
            <div className="label">Rental Start</div>
            <div className="value">{fmtDate(startTime)}</div>
          </div>
          <div className="grid-item">
            <div className="label">Rental End (Due Date)</div>
            <div className="value">{fmtDate(endTime)}</div>
          </div>
          <div className="grid-item">
            <div className="label">Security Deposit Authorized</div>
            <div className="value">{depositCents ? fmt(depositCents) : "—"}</div>
          </div>
          <div className="grid-item">
            <div className="label">Total Rental Amount</div>
            <div className="value">
              {fmt(totalCents)}
              {numDays > 0 && dailyRateCents > 0 && (
                <span style={{ fontSize: "8px", color: "#666", marginLeft: 4 }}>
                  ({fmt(dailyRateCents)}/day × {numDays} day{numDays !== 1 ? "s" : ""})
                </span>
              )}
            </div>
          </div>
          {pickupLocation && (
            <div className="grid-item span-2">
              <div className="label">Pickup / Return Location</div>
              <div className="value">{pickupLocation}</div>
            </div>
          )}
          {purpose && (
            <div className="grid-item span-4">
              <div className="label">Trip Purpose</div>
              <div className="value">{purpose}</div>
            </div>
          )}
        </div>

        <div className="section-title">Customer Information</div>
        <div className="grid-container">
          <div className="grid-item span-2">
            <div className="label">Full Name</div>
            <div className="value">{guestName}</div>
          </div>
          <div className="grid-item span-2">
            <div className="label">Phone Number</div>
            <div className="value">{guestPhone}</div>
          </div>
          <div className="grid-item span-2">
            <div className="label">Home Address</div>
            <div className="value">{guestAddress}</div>
          </div>
          <div className="grid-item">
            <div className="label">City / State / ZIP</div>
            <div className="value">{guestCity}</div>
          </div>
          <div className="grid-item">
            <div className="label">Email Address</div>
            <div className="value">{guestEmail}</div>
          </div>
          <div className="grid-item">
            <div className="label">Date of Birth</div>
            <div className="value">{fmtDateOnly(guestDOB)}</div>
          </div>
          <div className="grid-item">
            <div className="label">Driver's License #</div>
            <div className="value">{guestDLNum}</div>
          </div>
          <div className="grid-item">
            <div className="label">License State</div>
            <div className="value">{guestDLState}</div>
          </div>
          <div className="grid-item">
            <div className="label">License Expiration</div>
            <div className="value">{fmtDateOnly(guestDLExp)}</div>
          </div>
        </div>

        <div className="section-title">Additional Authorized Driver (Optional)</div>
        <div className="grid-container">
          <div className="grid-item span-2">
            <div className="label">Full Name</div>
            <div className="value">{addlName}</div>
          </div>
          <div className="grid-item span-2">
            <div className="label">Home Address</div>
            <div className="value">{addlAddress}</div>
          </div>
          <div className="grid-item">
            <div className="label">Driver's License #</div>
            <div className="value">{addlDLNum}</div>
          </div>
          <div className="grid-item">
            <div className="label">License State</div>
            <div className="value">{addlDLState}</div>
          </div>
          <div className="grid-item">
            <div className="label">License Expiration</div>
            <div className="value">{fmtDateOnly(addlDLExp)}</div>
          </div>
          <div className="grid-item">
            <div className="label">Date of Birth</div>
            <div className="value">{fmtDateOnly(addlDOB)}</div>
          </div>
        </div>

        <div className="section-title">Insurance Verification (Required)</div>
        <div className="legal-text">
          Drive Dobias LLC does <strong>not</strong> provide rental collision protection, liability coverage, or
          waivers. To operate the Vehicle, you must maintain active personal auto liability, comprehensive, and
          collision insurance policies meeting Wisconsin requirements that extend directly to rental units, or obtain
          verified temporary third-party rental insurance prior to dispatch.
          <div className="italic-block">
            "I explicitly understand that Drive Dobias LLC does not provide insurance. I certify that I maintain
            valid primary coverage extending to rental vehicles, or will purchase third-party protection before
            checkout. I accept absolute financial responsibility for all loss, liability, or damage not covered by
            my insurer."
          </div>
        </div>
        <div className="signature-container">
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Customer Insurance Verification Signature</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Date</div>
          </div>
        </div>

        <div className="section-title">Vehicle Condition, Mileage &amp; Energy Requirements</div>
        <div className="legal-text">
          You acknowledge that the vehicle is delivered in clean, perfect operating order. Mileage
          allowances and fuel expectations are bounded as follows:
          <ul>
            <li><strong>Free Mileage Matrix:</strong> Renter is allowed <strong>{freeMilesPerDay || "—"}</strong> free miles per day. Excess mileage will be
              billed at <strong>$0.50 per mile</strong>.</li>
            <li><strong>Electric Vehicle Rules:</strong> EVs must be returned with a battery State-of-Charge (SoC)
              equal to checkout levels. Returning below this will incur a refueling charge. A battery depletion
              fee of <strong>$50.00</strong> applies if returned under 20% SoC. Idle fees from charging networks
              are fully transferred to the Renter.</li>
            <li><strong>Hybrid Vehicle Rules:</strong> Plug-in or standard ICE hybrids must be returned with the
              identical fuel levels noted at checkout. Deficits are billed at market rate refueling premiums.</li>
          </ul>
        </div>

        <div className="footer">
          <div>DRIVE DOBIAS LLC &bull; RENTAL CONTRACT</div>
          <div>PAGE 1 OF 2</div>
        </div>
      </div>

      {/* ── PAGE 2 ── */}
      <div className="page">
        <div className="header">
          <img className="logo" src={logoSrc} alt="Drive Dobias LLC Logo" />
          <div className="company-name">Drive Dobias LLC</div>
          <div className="company-contact">TERMS &amp; CONDITIONS &bull; CONTRACT #: {contractNum}</div>
        </div>

        <div className="legal-text">
          <ol>
            <li><strong>Definitions.</strong> "Agreement" means all terms and conditions found on both pages of this
              form. "You" or "your" means the primary customer, any signee, authorized driver, or company to whom
              charges are directed. All parties labeled "you" are jointly and severally bound. "We", "our", or
              "us" means Drive Dobias LLC. "Authorized Driver" means the renter and drivers listed on Page 1,
              provided they hold a valid license and are at least age 21. Only Authorized Drivers may operate the
              Vehicle. "Vehicle" means the automobile identified and any components, tires, tools, accessories,
              keys, or vehicle documents. "Physical Damage" means damage to, or loss of, the Vehicle caused by
              collision or upset; it excludes comprehensive events or interior degradation unless caused by direct
              collision impact. Comprehensive damage or loss explicitly excluded from Physical Damage includes:
              loss of the Vehicle due to theft; vandalism; act of nature; riot or civil disturbance; hail, flood;
              or fire. Physical Damage also excludes interior burn holes, window stars, or cracks not caused by
              collision or upset. "Loss of use" means the loss of our ability to use the Vehicle for any purpose
              caused by damage or loss during this rental. Loss of use is calculated by multiplying the number of
              days from the date the Vehicle is damaged or lost until it is repaired or replaced, times the daily
              rental rate. "Diminished Value" means the reduction in the fair market value of the Vehicle caused
              by damage to it or repair of it, as determined by industry standard valuation methods or
              professional appraisal. "Administrative Expenses" means reasonable costs incurred by Drive Dobias
              LLC in processing damage claims, coordinating repairs, communicating with insurers, and managing the
              rental asset disruption.</li>
            <li><strong>Rental, Indemnity and Warranties.</strong> This is a strict contract for short-term vehicle
              bailment. We reserve the right to repossess the Vehicle at your sole expense without notice if
              abandoned or used in violation of law or this Agreement. You agree to indemnify, defend, and hold
              harmless Drive Dobias LLC from all claims, liability, administrative costs, and attorney fees we
              incur resulting from, or arising out of, this rental and your use of the Vehicle. We extend no
              express, implied, or apparent warranties regarding the vehicle, no warranty of merchantability, and
              no warranty that the vehicle is fit for a particular purpose.</li>
            <li><strong>Condition and Return of Vehicle.</strong> You must return the Vehicle to our designated
              location on the exact date and time specified, in the identical condition received, barring ordinary
              wear. If returned after closing hours, you remain fully responsible for vehicle safety, damage, or
              asset loss until physically inspected by us at our next business opening. Service to the vehicle or
              replacement of parts or accessories requires our prior written approval. You must check and maintain
              all fluid levels.</li>
            <li><strong>Responsibility for Damage or Loss; Reporting to Police.</strong> You are responsible for all
              vehicle theft, damage, or loss, which includes repair costs or actual cash retail value on the date
              of loss if unrepairable, plus operational loss of use, diminished value, towing, storage, and
              administrative expenses. Accidents, vandalism, or thefts must be reported directly to Drive Dobias
              LLC and law enforcement instantly upon discovery.</li>
            <li><strong>Breach of Agreement &amp; Prohibited Uses.</strong> Any engagement in the following prohibited
              behaviors constitutes an absolute contractual breach, voids insurance extension, and allows instant
              repossession:
              <ol style={{ listStyleType: "lower-alpha", marginBottom: 0 }}>
                <li>Operation by any individual unlisted as an Authorized Driver, or whose license is suspended/invalid in any jurisdiction.</li>
                <li>Operation while under the influence of prescription/non-prescription drugs, alcohol, or chemical substances causing impairment.</li>
                <li>Obtaining the asset or extending the rental period via fraudulent, omitted, or misleading user credentials.</li>
                <li>Use in furtherance of illegal acts, commercial ride-sharing (including but not limited to Uber, Lyft, or similar services), courier dispatch, passenger hauling or property for hire, towing, or pushing operations, or any commercial business purpose without prior written approval.</li>
                <li>Teaching driving, racing, speed tests, or contests.</li>
                <li>Tampering with or disconnecting the odometer, charging peripherals, or built-in telematics hardware.</li>
                <li>Transporting any animals in the Vehicle without prior written approval from Drive Dobias LLC. Service animals as defined by the ADA are exempt from this restriction. Hauling inadequately secured, dangerous, or hazardous cargo is strictly prohibited.</li>
                <li>Failing to summon police authorities to any operational accident causing property damage or personal injury.</li>
                <li>Transporting children without approved child safety seats as required by law.</li>
                <li>Operating the vehicle if the operator lacks experience operating a manual transmission.</li>
                <li>Loading the vehicle beyond its manufacturer-stated capacity bounds.</li>
                <li>Driving or operating the vehicle asset on unpaved roads as a standalone absolute restriction.</li>
                <li>Transporting more persons than the Vehicle has seat belts, or carrying persons outside the passenger compartment.</li>
                <li>Any damage resulting from your willful, wanton, or reckless act or misconduct.</li>
                <li>Smoking, vaping, or use of tobacco products inside the Vehicle. Violation will result in a mandatory $350.00 detailed extraction cleaning and ozone remediation fee.</li>
                <li>Operating or driving the Vehicle outside the geographic limitations specified in this Agreement. The Vehicle must not be driven more than a [___] mile radius from Muskego, Wisconsin, or outside the state of Wisconsin, without prior written approval from Drive Dobias LLC. Violation of geographic restrictions constitutes an absolute breach and allows immediate repossession.</li>
              </ol>
              You waive all recourse against us for any criminal reports or prosecutions that we take against you that arise out of your breach of this agreement.
            </li>
            <li><strong>Insurance.</strong> You are responsible for all damage or loss you cause to others. You
              agree to provide auto liability, collision, and comprehensive insurance covering you, us, and the
              Vehicle. Where state law requires us to provide auto liability insurance, or if you have no auto
              liability insurance, we provide auto liability insurance (the "Policy") that is secondary to any
              other valid and collectible insurance whether primary, secondary, excess, or contingent. The Policy
              provides bodily injury and property damage liability coverage with limits no higher than minimum
              levels prescribed by the vehicular financial responsibility laws of the state whose laws apply to
              the loss. You and we reject PIP, medical payments, no-fault, and uninsured and under-insured
              motorist coverage, where permitted by law. The Policy is void if you violate the terms of this
              Agreement, or if you fail to cooperate in any loss investigation conducted by us or our insurer.</li>
            <li><strong>Charges and Fees.</strong> You will pay on demand all charges due under this Agreement,
              including: (a) time and mileage charges, or if the odometer is tampered with or disconnected, a
              mileage charge calculated based on our experience with similar vehicle usage patterns, or a flat
              daily mileage charge of (___) miles per day for the rental period; (b) additional driver elements;
              (c) missing charging adapters or optional items; (d) applicable local taxes; (e) traffic, parking,
              and toll violations, fines, penalties, forfeitures, court costs, towing, impound storage, and all
              daily storage fees incurred while the vehicle is impounded, unless these expenses are our fault; (f)
              a cleaning fee up to $350.00 if returned substantially less clean than when rented; (g) a charge of
              $50, plus $5/mile for every mile between the renting location and the place where the Vehicle is
              returned, repossessed, or abandoned, plus all other expenses we incur in locating and recovering the
              Vehicle if you fail to return it or if we elect to repossess it; and (h) all costs, including pre-
              and post-judgment attorney fees, we incur collecting payment from you or otherwise enforcing our
              rights under this Agreement. Past due balances accrue a 2% monthly late charge or maximum permitted
              legal bounds. Retained deposits may be applied to any unpaid charges under this Agreement.</li>
            <li><strong>Personal Property, Modifications &amp; Waivers.</strong> Drive Dobias LLC is released from all
              liability regarding personal items left inside the vehicle asset, service vehicles, or our premises,
              whether or not caused by our negligence. No contractual changes or terms can be waived or modified
              unless explicitly signed in writing by an officer of Drive Dobias LLC. If you wish to extend the
              rental period, you must return the Vehicle to our rental office for physical inspection and written
              amendment by us of the due-in date. This Agreement constitutes the entire agreement between you and
              us, and all prior representations or agreements regarding this rental are void. A waiver by us of
              any breach is not a waiver of any additional breach or future performance. If any provision of this
              Agreement is deemed void or unenforceable by a court of competent jurisdiction, the remaining
              provisions shall remain valid and enforceable to the maximum extent permitted by law. You release us
              from any liability for consequential, special, or punitive damages in connection with this rental
              unless prohibited by law.</li>
          </ol>
        </div>

        <div className="section-title">Telematics Disclosure</div>
        <div className="legal-text">
          By signing below, you provide unconditioned consent to our use of continuous
          cellular-linked telematics systems. Hardware monitors real-time GPS tracking, battery State-of-Charge logs,
          public network charging locations, velocity curves, safety alerts, odometer tracking, and mechanical
          diagnostics. Data is explicitly processed to verify lease parameters, calculate billing compliance, and
          execute asset location, theft prevention, or recovery maneuvers. Telematics data is retained for (___)
          days/months and is used solely for the purposes stated above. Data is protected by industry-standard
          security measures and is not shared with third parties except as required by law or to enforce this
          Agreement.
        </div>

        <div className="section-title">Damage Matrix &amp; Photo Inspection</div>
        <table>
          <thead>
            <tr>
              <th>Damage Classification</th>
              <th style={{ width: "10%" }}>Responsible?</th>
              <th>Contractual Treatment / Recovery Terms</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Scratches under 2"</strong></td><td>Yes</td><td>Considered beyond normal wear and tear if deep or clear-coat penetrating.</td></tr>
            <tr><td><strong>Scratches over 2" / Body Dents</strong></td><td>Yes</td><td>Billed at direct professional body repair cost.</td></tr>
            <tr><td><strong>Curb Rash / Wheel Defects</strong></td><td>Yes</td><td>Actual cost of wheel reconditioning or full structural replacement.</td></tr>
            <tr><td><strong>Windshield / Window Damage</strong></td><td>Yes</td><td>Actual cost of replacement glass and installation.</td></tr>
            <tr><td><strong>Headlight / Taillight Damage</strong></td><td>Yes</td><td>Actual cost of replacement bulb/assembly and installation.</td></tr>
            <tr><td><strong>Tire Damage / Punctures</strong></td><td>Yes</td><td>Actual cost of tire repair or replacement.</td></tr>
            <tr><td><strong>Interior Stains / Odors / Smoke</strong></td><td>Yes</td><td>Detailed extraction cleaning and ozone remediation flat fee applies ($350.00).</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: 8, fontWeight: "bold" }}>
          Return Inspection:
          <div className="checkbox-group">
            <div className="checkbox-item"><div className="checkbox-box" /> Front / Rear Ext</div>
            <div className="checkbox-item"><div className="checkbox-box" /> Left / Right Side</div>
            <div className="checkbox-item"><div className="checkbox-box" /> Interior Front/Rear</div>
            <div className="checkbox-item"><div className="checkbox-box" /> Wheels, Tires &amp; Dash</div>
          </div>
        </div>

        <div className="section-title">Final Execution &amp; Signatures</div>
        <div className="legal-text" style={{ marginBottom: 5 }}>
          Your signature below authorizes Drive Dobias LLC to process your primary credit card voucher on file
          for all rental items, asset damage recovery, charging/refueling overhead, or municipal citations.
        </div>
        <div className="signature-container" style={{ marginTop: 5 }}>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Primary Customer Signature</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Date</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Additional Driver Signature</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Date</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Authorized Drive Dobias LLC Agent Signature</div>
          </div>
          <div className="sig-block">
            <div className="sig-space" />
            <div className="sig-caption">Date</div>
          </div>
        </div>

        <div className="footer">
          <div>DRIVE DOBIAS LLC &bull; TERMS &amp; CONDITIONS</div>
          <div>PAGE 2 OF 2</div>
        </div>
      </div>
    </>
  );
}
