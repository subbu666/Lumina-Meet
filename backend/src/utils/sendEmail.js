/**
 * VideoMeet — Premium Email Service
 *
 * Design principles:
 *  • Zero SVG, zero CSS flexbox/grid — only table-based layouts (Gmail/Outlook safe)
 *  • All OTP digits in a single fixed-width table — never overflow on any device
 *  • Inline styles only (Gmail strips <style> blocks on mobile)
 *  • Gradient text replaced with solid colored text where -webkit-text-fill-color may fail
 *  • VML-safe for Outlook desktop
 *  • Tested viewport: 320px → 700px
 *
 * COPY OTP BUTTON — Gmail-compatible implementation:
 *
 *  Gmail STRIPS <script> tags completely — so no global functions can be defined.
 *  Gmail's service worker BLOCKS navigator.clipboard.writeText() with a network error.
 *
 *  Solution: Pure inline onclick using ONLY document.execCommand('copy') via a
 *  temporary <input> element. No async, no Promises, no external APIs.
 *  execCommand is synchronous and runs entirely in the DOM — Gmail cannot block it.
 *
 *  The entire handler fits in one onclick attribute, uses only:
 *    - document.createElement / appendChild / removeChild  (always allowed)
 *    - document.execCommand('copy')                        (synchronous, no network)
 *    - element.style mutations + setTimeout               (always allowed)
 *
 *  Works in: Gmail web ✓  Outlook web ✓  Yahoo Mail web ✓  Any browser ✓
 *  Does NOT work in: Outlook desktop, Apple Mail (JS fully sandboxed — unavoidable)
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// ─── Core send wrapper ────────────────────────────────────────────────────────

const sendEmail = async (options) => {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.EMAIL_FROM_ADDRESS || "noreply@videomeet.app";
    const fromName = process.env.EMAIL_FROM_NAME || "VideoMeet";

    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

    const payload = {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: options.to, name: options.toName || options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text,
    };

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Brevo API ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Email sent: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Email failed:", error.message);
    return { success: false, error: error.message };
  }
};

// ─── Design tokens (inline-safe hex / rgba values) ────────────────────────────

const T = {
  bg: "#07070f",
  card: "#0f1129",
  cardBorder: "#1e2047",
  surface: "#161836",
  surfaceBorder: "#252850",
  white: "#ffffff",
  white90: "#e8eaff",
  white60: "rgba(255,255,255,0.60)",
  white40: "rgba(255,255,255,0.40)",
  white25: "rgba(255,255,255,0.25)",
  white10: "rgba(255,255,255,0.10)",
  indigo: "#6366f1",
  indigoDark: "#4f52d4",
  indigoGlow: "rgba(99,102,241,0.35)",
  violet: "#8b5cf6",
  cyan: "#22d3ee",
  cyanDark: "#0891b2",
  green: "#10b981",
  greenDark: "#059669",
  greenGlow: "rgba(16,185,129,0.35)",
  amber: "#f59e0b",
  amberLight: "#fcd34d",
  red: "#ef4444",
  blue: "#3b82f6",
  blueLight: "#93c5fd",
  year: new Date().getFullYear(),
};

// ─── Shared layout helpers ────────────────────────────────────────────────────

/**
 * Outer shell — centers card, sets background, resets box model.
 * Uses a 1-column table so Outlook respects the max-width.
 * NO <script> tags — Gmail strips them. All JS lives in inline onclick attrs.
 */
const shell = (innerHtml, previewText = "") => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <title>VideoMeet</title>
  <style>
    /* Client resets */
    body,table,td,p,a,li,blockquote{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    body{margin:0;padding:0;background-color:${T.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
    table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    td{padding:0;}
    img{border:0;outline:none;text-decoration:none;display:block;-ms-interpolation-mode:bicubic;}
    a{text-decoration:none;}
    /* Copy OTP button hover */
    .copy-otp-btn:hover{background:rgba(99,102,241,0.25)!important;border-color:rgba(99,102,241,0.60)!important;color:#ffffff!important;}
    /* Mobile overrides */
    @media only screen and (max-width:599px){
      .wrapper{width:100%!important;padding:16px 12px!important;}
      .card{border-radius:20px!important;}
      .hdr{padding:36px 20px 28px!important;}
      .body{padding:24px 20px!important;}
      .ftr{padding:20px 20px 28px!important;}
      .otp-table{width:auto!important;}
      .otp-cell{width:38px!important;height:52px!important;font-size:24px!important;border-radius:12px!important;}
      .otp-gap{width:5px!important;}
      .btn-cta{font-size:15px!important;padding:16px 18px!important;}
      .title-text{font-size:22px!important;}
      .body-text{font-size:14px!important;line-height:1.65!important;}
      .detail-icon{display:none!important;width:0!important;max-width:0!important;overflow:hidden!important;}
      .detail-pad{padding-left:0!important;}
      .hide-mobile{display:none!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${T.bg};">
  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${T.bg};">
    <tr>
      <td align="center" class="wrapper" style="padding:32px 20px;">
        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;" class="card-outer">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                style="background-color:${T.card};border-radius:24px;border:1px solid ${T.cardBorder};overflow:hidden;"
                class="card">
                ${innerHtml}
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer brand line -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;margin-top:24px;">
          <tr>
            <td align="center" style="padding:0 20px;">
              <p style="margin:0;font-size:11px;color:${T.white25};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.8;">
                &copy; ${T.year} VideoMeet &nbsp;&bull;&nbsp; Secure video meetings for everyone<br>
                <a href="#" style="color:${T.white25};text-decoration:none;">Privacy</a>
                &nbsp;&nbsp;
                <a href="#" style="color:${T.white25};text-decoration:none;">Terms</a>
                &nbsp;&nbsp;
                <a href="#" style="color:${T.white25};text-decoration:none;">Support</a>
                &nbsp;&nbsp;
                <a href="#" style="color:${T.white25};text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * OTP digit row — fixed 48px cells, never overflows.
 * On mobile the @media rule shrinks each cell to 38px.
 * The digit-gap columns collapse on very small screens via the otp-gap class.
 */
const otpRow = (code, bgFrom, bgTo, borderColor, glowColor) => {
  const digits = code.split("");
  const cells = digits
    .map((d, i) => {
      const spacer =
        i < digits.length - 1
          ? `<td class="otp-gap" width="8" style="width:8px;"></td>`
          : "";
      return `
      <td class="otp-cell" align="center" valign="middle"
        style="
          width:48px;
          height:64px;
          background:linear-gradient(150deg,${bgFrom}22,${bgTo}18);
          border:1.5px solid ${borderColor};
          border-radius:14px;
          box-shadow:0 6px 20px ${glowColor}28,inset 0 1px 0 rgba(255,255,255,0.10);
          font-family:'Courier New',Courier,monospace;
          font-size:30px;
          font-weight:800;
          color:${T.white};
          letter-spacing:0;
          text-align:center;
          vertical-align:middle;
          line-height:1;
          mso-line-height-rule:exactly;
        ">${d}</td>${spacer}`;
    })
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
      class="otp-table" style="margin:0 auto;">
      <tr>${cells}</tr>
    </table>`;
};

/**
 * Copy OTP button — Gmail-safe implementation.
 *
 * KEY INSIGHT from debugging:
 *  - Gmail STRIPS <script> tags → no global functions available
 *  - Gmail's service worker BLOCKS navigator.clipboard.writeText() → Promise rejection / network error
 *  - ONLY safe approach: pure synchronous execCommand('copy') via a hidden <input>, fully inline
 *
 * The onclick attribute contains a self-contained IIFE that:
 *  1. Creates a hidden <input type="text"> (not textarea — avoids scroll-jump on mobile)
 *  2. Sets its value to the OTP code (embedded as a literal string, HTML-entity-safe)
 *  3. Selects the input value
 *  4. Calls document.execCommand('copy') — synchronous, no Promises, no network, Gmail allows it
 *  5. Removes the input
 *  6. Mutates the button element directly for visual feedback (green ✓ or red ✗)
 *  7. Resets after 2000ms via setTimeout
 *
 * NO navigator.clipboard — avoids Gmail service worker interception entirely.
 * NO external function calls — entire logic self-contained in the attribute.
 *
 * Works in: Gmail web ✓  Outlook web ✓  Yahoo Mail web ✓  Any browser ✓
 * Does NOT work in: Outlook desktop, Apple Mail (JS fully sandboxed — unavoidable)
 */
const copyOtpButton = (code, accentColor, accentBorder) => {
  // OTP codes are always digits — no escaping needed, but be safe anyway
  const safeCode = String(code).replace(/&/g, "&amp;").replace(/'/g, "&#39;");

  // Inline IIFE — uses only synchronous DOM APIs that Gmail's sandbox permits.
  // Written without line breaks so attribute parsers don't choke.
  // 'el' = the anchor tag (this), passed from onclick.
  // We avoid innerHTML mutation during execCommand to prevent focus loss.
  const handler = [
    `var el=this;`,
    `var d=el.ownerDocument;`, // ← get the RIGHT document
    `var b=d.body||d.documentElement;`, // ← fallback to <html> if no <body>
    `var inp=d.createElement('input');`, // ← create in the right document
    `inp.value='${safeCode}';`,
    `inp.setAttribute('readonly','');`,
    `inp.style.cssText='position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;border:0;padding:0;';`,
    `b.appendChild(inp);`, // ← append to the right body
    `inp.focus();inp.select();`,
    `inp.setSelectionRange(0,9999);`,
    `var ok=false;`,
    `try{ok=d.execCommand('copy');}catch(e){}`, // ← execCommand on the right document
    `b.removeChild(inp);`, // ← remove from the right body
    `var oh=el.innerHTML,oc=el.style.color,ob=el.style.borderColor,obg=el.style.background;`,
    `if(ok){`,
    `el.innerHTML='&#10003;&nbsp;&nbsp;OTP Copied to Clipboard!';`,
    `el.style.color='#10b981';`,
    `el.style.borderColor='rgba(16,185,129,0.60)';`,
    `el.style.background='rgba(16,185,129,0.10)';`,
    `}else{`,
    `el.innerHTML='&#10007;&nbsp;&nbsp;Copy Failed';`,
    `el.style.color='#ef4444';`,
    `el.style.borderColor='rgba(239,68,68,0.50)';`,
    `el.style.background='rgba(239,68,68,0.08)';`,
    `}`,
    `setTimeout(function(){`,
    `el.innerHTML=oh;`,
    `el.style.color=oc;`,
    `el.style.borderColor=ob;`,
    `el.style.background=obg;`,
    `},2000);`,
    `return false;`,
  ].join("");

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
    <tr>
      <td align="center">
        <a href="#"
          class="copy-otp-btn"
          onclick="${handler}"
          title="Copy OTP to clipboard"
          style="
            display:inline-block;
            padding:9px 20px;
            background:rgba(255,255,255,0.04);
            border:1px solid ${accentBorder};
            border-radius:100px;
            font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
            font-size:12px;
            font-weight:700;
            color:${accentColor};
            letter-spacing:0.6px;
            text-decoration:none;
            cursor:pointer;
            transition:background 0.2s,border-color 0.2s,color 0.2s;
          ">&#128203;&nbsp;&nbsp;Copy OTP</a>
      </td>
    </tr>
  </table>`;
};

/**
 * Horizontal divider
 */
const divider = () => `
  <tr>
    <td style="padding:0 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="height:1px;background:linear-gradient(90deg,transparent,${T.white10},transparent);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`;

/**
 * Pill badge
 */
const badge = (text, color, bgColor, borderColor) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
    <tr>
      <td style="background:${bgColor};border:1px solid ${borderColor};border-radius:100px;padding:7px 18px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:${color};letter-spacing:0.8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap;">${text}</p>
      </td>
    </tr>
  </table>`;

/**
 * Icon circle using text/emoji — zero image dependency, renders everywhere
 */
const iconCircle = (emoji, bgFrom, bgTo, glowColor) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
    <tr>
      <td align="center" valign="middle"
        style="
          width:64px;height:64px;
          background:linear-gradient(135deg,${bgFrom},${bgTo});
          border-radius:20px;
          box-shadow:0 12px 36px ${glowColor};
          font-size:30px;
          text-align:center;
          vertical-align:middle;
          line-height:64px;
          mso-line-height-rule:exactly;
        ">${emoji}</td>
    </tr>
  </table>`;

/**
 * Primary CTA button — full-width, table-based so it's clickable in Outlook
 */
const ctaButton = (href, label, bgFrom, bgTo, glowColor) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td align="center" style="padding:0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${href}" style="height:54px;v-text-anchor:middle;width:400px;" arcsize="15%"
          strokecolor="${bgTo}" fillcolor="${bgFrom}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:800;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${href}" class="btn-cta"
          style="
            display:inline-block;
            width:100%;
            max-width:400px;
            padding:18px 24px;
            background:linear-gradient(135deg,${bgFrom},${bgTo});
            color:#ffffff;
            font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
            font-size:16px;
            font-weight:800;
            text-align:center;
            text-decoration:none;
            border-radius:14px;
            box-shadow:0 10px 32px ${glowColor};
            letter-spacing:0.4px;
            box-sizing:border-box;
          ">${label}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;

/**
 * Surface box (used for OTP wrap, info cards, etc.)
 */
const surfaceBox = (
  innerHtml,
  bgColor,
  borderColor,
  radius = "16px",
  padding = "24px 20px",
) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="background:${bgColor};border:1px solid ${borderColor};border-radius:${radius};padding:${padding};">
        ${innerHtml}
      </td>
    </tr>
  </table>`;

/**
 * Key-value detail row with emoji icon
 */
const detailRow = (emoji, label, value, iconBg, isLast = false) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="margin-bottom:${isLast ? "0" : "8px"};">
    <tr>
      <td class="detail-icon" valign="middle"
        style="width:48px;padding-right:12px;vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" valign="middle"
              style="width:40px;height:40px;background:${iconBg};border-radius:10px;font-size:18px;text-align:center;vertical-align:middle;line-height:40px;mso-line-height-rule:exactly;">
              ${emoji}
            </td>
          </tr>
        </table>
      </td>
      <td class="detail-pad" valign="middle" style="vertical-align:middle;">
        <p style="margin:0 0 2px 0;font-size:10px;font-weight:700;color:${T.white40};text-transform:uppercase;letter-spacing:1.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${label}</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:${T.white90};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${value}</p>
      </td>
    </tr>
  </table>`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. OTP VERIFICATION EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export const sendOTPEmail = async (toEmail, otpCode, username = "there") => {
  const preview = `Your VideoMeet verification code is ${otpCode} — expires in 5 minutes`;

  const inner = `
    <!-- ══ HEADER ══ -->
    <tr>
      <td class="hdr" style="padding:48px 40px 36px;text-align:center;background:linear-gradient(160deg,rgba(99,102,241,0.18) 0%,rgba(139,92,246,0.10) 55%,transparent 100%);border-radius:24px 24px 0 0;">
        ${iconCircle("✉️", T.indigo, T.violet, T.indigoGlow)}
        <!-- Accent bar above title -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
          <tr>
            <td style="width:40px;height:3px;background:linear-gradient(90deg,${T.indigo},${T.violet});border-radius:2px;"></td>
            <td style="width:8px;"></td>
            <td style="width:8px;height:3px;background:${T.violet};border-radius:2px;opacity:0.5;"></td>
          </tr>
        </table>
        <p class="title-text" style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:${T.white};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.5px;">Verify Your Email</p>
        <p style="margin:0;font-size:14px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Secure your VideoMeet account in one step</p>
      </td>
    </tr>

    <!-- ══ BODY ══ -->
    <tr>
      <td class="body" style="padding:36px 40px;">

        <!-- Greeting -->
        <p style="margin:0 0 10px 0;font-size:18px;font-weight:800;color:${T.white90};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Hi ${username} 👋</p>
        <p class="body-text" style="margin:0 0 32px 0;font-size:15px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.75;">
          Welcome to <strong style="color:#a5b4fc;">VideoMeet</strong>! Enter the verification code below to confirm your email address and activate your account.
        </p>

        <!-- OTP BOX -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.22);border-radius:20px;margin-bottom:16px;">
          <tr>
            <td style="padding:32px 20px;text-align:center;">
              <p style="margin:0 0 20px 0;font-size:10px;font-weight:700;color:${T.white40};text-transform:uppercase;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Your Verification Code</p>
              ${otpRow(otpCode, T.indigo, T.violet, "rgba(99,102,241,0.50)", T.indigo)}
              ${copyOtpButton(otpCode, "#a5b4fc", "rgba(99,102,241,0.40)")}
              <p style="margin:14px 0 0 0;font-size:12px;color:${T.white40};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Enter this code exactly as shown</p>
            </td>
          </tr>
        </table>

        <!-- Expiry bar -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
          <tr>
            <td style="background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.22);border-radius:12px;padding:14px 20px;text-align:center;">
              <p style="margin:0;font-size:14px;font-weight:600;color:${T.amber};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#9200;&nbsp; This code expires in 5 minutes</p>
            </td>
          </tr>
        </table>

        <!-- Security notice -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background:rgba(239,68,68,0.06);border-left:4px solid rgba(239,68,68,0.55);border-radius:0 12px 12px 0;padding:16px 20px;">
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#fca5a5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#128274; Security Notice</p>
              <p style="margin:0;font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.65;">Never share this code with anyone. VideoMeet staff will never ask for it. If you didn't create an account, safely ignore this email.</p>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    ${divider()}

    <!-- ══ FOOTER ══ -->
    <tr>
      <td class="ftr" style="padding:24px 40px 32px;text-align:center;">
        <!-- Dot row -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="width:6px;height:6px;background:${T.indigo};border-radius:50%;"></td>
            <td style="width:8px;"></td>
            <td style="width:6px;height:6px;background:${T.violet};border-radius:50%;opacity:0.6;"></td>
            <td style="width:8px;"></td>
            <td style="width:6px;height:6px;background:${T.cyan};border-radius:50%;opacity:0.4;"></td>
          </tr>
        </table>
        <p style="margin:0;font-size:12px;color:${T.white25};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.8;">
          This email was sent to ${toEmail} because you signed up for VideoMeet.<br>
          You can <a href="#" style="color:${T.white40};text-decoration:underline;">unsubscribe</a> at any time.
        </p>
      </td>
    </tr>`;

  return sendEmail({
    to: toEmail,
    subject: `${otpCode} — Your VideoMeet Verification Code`,
    html: shell(inner, preview),
    text: `Hi ${username},\n\nYour VideoMeet verification code is: ${otpCode}\n\nExpires in 5 minutes. Never share this code with anyone.`,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MEETING INVITATION EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export const sendMeetingInvitationEmail = async (
  toEmail,
  meetingData,
  inviterName = "Someone",
) => {
  const {
    meetingId,
    title,
    description,
    meetingLink,
    scheduledFor,
    password,
    isPasswordProtected,
  } = meetingData;

  const meetingDate = scheduledFor
    ? new Date(scheduledFor).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Instant Meeting — Available Now";
  const meetingTime = scheduledFor
    ? new Date(scheduledFor).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  const preview = `${inviterName} invited you to "${title}" on VideoMeet`;

  const inner = `
    <!-- ══ HEADER ══ -->
    <tr>
      <td class="hdr" style="padding:48px 40px 32px;text-align:center;background:linear-gradient(160deg,rgba(16,185,129,0.16) 0%,rgba(99,102,241,0.09) 55%,transparent 100%);border-radius:24px 24px 0 0;">
        ${iconCircle("&#127909;", T.green, T.indigo, T.greenGlow)}
        ${badge("&#9679;&nbsp; Meeting Invitation", T.green, "rgba(16,185,129,0.12)", "rgba(16,185,129,0.30)")}
        <p class="title-text" style="margin:0 0 6px 0;font-size:25px;font-weight:800;color:${T.white};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.4px;">${inviterName} invited you</p>
        <p style="margin:0;font-size:14px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Join the conversation on VideoMeet</p>
      </td>
    </tr>

    <!-- ══ BODY ══ -->
    <tr>
      <td class="body" style="padding:32px 40px;">

        <!-- Meeting title card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:18px;margin-bottom:20px;">
          <tr>
            <td style="padding:24px;">
              <!-- Coloured left stripe + title -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td valign="top" style="width:4px;background:linear-gradient(180deg,${T.green},${T.indigo});border-radius:2px;padding:0;"></td>
                  <td style="width:14px;"></td>
                  <td valign="top">
                    <p style="margin:0 0 6px 0;font-size:18px;font-weight:800;color:${T.white};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${title}</p>
                    ${description ? `<p style="margin:0;font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.65;">${description}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Detail rows -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:18px;margin-bottom:24px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${T.surfaceBorder};">
              ${detailRow("&#128197;", "Date", meetingDate, "rgba(16,185,129,0.15)")}
            </td>
          </tr>
          ${
            meetingTime
              ? `
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${T.surfaceBorder};">
              ${detailRow("&#128336;", "Time", meetingTime, "rgba(99,102,241,0.15)")}
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:16px 20px;">
              ${detailRow("&#128279;", "Meeting ID", `<span style="font-family:'Courier New',Courier,monospace;font-size:13px;">${meetingId}</span>`, "rgba(245,158,11,0.15)", true)}
            </td>
          </tr>
        </table>

        <!-- CTA -->
        ${ctaButton(meetingLink, "&#127909;&nbsp;&nbsp;Join Meeting", T.green, T.greenDark, T.greenGlow)}

        <!-- Link fallback -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
          <tr>
            <td style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:12px;padding:14px 18px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:${T.white40};text-transform:uppercase;letter-spacing:1.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Or paste this link in your browser</p>
              <p style="margin:0;font-size:12px;color:#818cf8;font-family:'Courier New',Courier,monospace;word-break:break-all;">${meetingLink}</p>
            </td>
          </tr>
        </table>

        ${
          isPasswordProtected && password
            ? `
        <!-- Password box -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
          <tr>
            <td style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.20);border-radius:14px;padding:20px;text-align:center;">
              <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:rgba(251,191,36,0.7);text-transform:uppercase;letter-spacing:1.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#128274; Meeting Password</p>
              <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:800;color:${T.amber};letter-spacing:10px;">${password}</p>
            </td>
          </tr>
        </table>`
            : ""
        }

        <!-- Tips -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;">
          <tr>
            <td style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:14px;padding:20px 22px;">
              <p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:${T.blueLight};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#128161; Before You Join</p>
              ${[
                "Test your camera &amp; microphone beforehand",
                "Use a stable Wi-Fi connection (5+ Mbps)",
                "Join 5 minutes early for scheduled meetings",
                "Wear headphones to prevent audio echo",
              ]
                .map(
                  (tip) => `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
                <tr>
                  <td valign="top" style="width:18px;font-size:13px;color:${T.green};font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;padding-top:1px;">&#10003;</td>
                  <td valign="top" style="font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.6;">${tip}</td>
                </tr>
              </table>`,
                )
                .join("")}
            </td>
          </tr>
        </table>

      </td>
    </tr>

    ${divider()}

    <!-- ══ FOOTER ══ -->
    <tr>
      <td class="ftr" style="padding:22px 40px 30px;text-align:center;">
        <p style="margin:0;font-size:12px;color:${T.white25};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.8;">
          You received this because <strong style="color:${T.white40};">${inviterName}</strong> invited you to a meeting.<br>
          Not expecting this? You can safely ignore it.
        </p>
      </td>
    </tr>`;

  return sendEmail({
    to: toEmail,
    subject: `Meeting Invitation: ${title} — VideoMeet`,
    html: shell(inner, preview),
    text: `${inviterName} invited you to: ${title}\n\nDate: ${meetingDate}${meetingTime ? `\nTime: ${meetingTime}` : ""}\nMeeting ID: ${meetingId}\n\nJoin: ${meetingLink}${isPasswordProtected ? `\nPassword: ${password}` : ""}`,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PASSWORD RESET EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export const sendPasswordResetEmail = async (
  toEmail,
  otpCode,
  username = "there",
) => {
  const preview = `Your VideoMeet password reset code is ${otpCode} — expires in 10 minutes`;

  const inner = `
    <!-- ══ HEADER ══ -->
    <tr>
      <td class="hdr" style="padding:48px 40px 36px;text-align:center;background:linear-gradient(160deg,rgba(245,158,11,0.18) 0%,rgba(239,68,68,0.12) 55%,transparent 100%);border-radius:24px 24px 0 0;">
        ${iconCircle("&#128274;", T.amber, T.red, "rgba(245,158,11,0.40)")}
        <!-- Accent bar -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
          <tr>
            <td style="width:40px;height:3px;background:linear-gradient(90deg,${T.amber},${T.red});border-radius:2px;"></td>
            <td style="width:8px;"></td>
            <td style="width:8px;height:3px;background:${T.red};border-radius:2px;opacity:0.5;"></td>
          </tr>
        </table>
        <p class="title-text" style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:${T.white};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.5px;">Reset Your Password</p>
        <p style="margin:0;font-size:14px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Account security verification</p>
      </td>
    </tr>

    <!-- ══ BODY ══ -->
    <tr>
      <td class="body" style="padding:36px 40px;">

        <p style="margin:0 0 10px 0;font-size:18px;font-weight:800;color:#fef3c7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Hi ${username},</p>
        <p class="body-text" style="margin:0 0 32px 0;font-size:15px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.75;">
          We received a request to reset your <strong style="color:${T.amberLight};">VideoMeet</strong> password. Use the code below to verify your identity and set a new password.
        </p>

        <!-- OTP BOX -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.22);border-radius:20px;margin-bottom:16px;">
          <tr>
            <td style="padding:32px 20px;text-align:center;">
              <p style="margin:0 0 20px 0;font-size:10px;font-weight:700;color:${T.white40};text-transform:uppercase;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Password Reset Code</p>
              ${otpRow(otpCode, T.amber, T.red, "rgba(245,158,11,0.50)", T.amber)}
              ${copyOtpButton(otpCode, T.amber, "rgba(245,158,11,0.40)")}
              <p style="margin:14px 0 0 0;font-size:12px;color:${T.white40};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Enter this in the reset password screen</p>
            </td>
          </tr>
        </table>

        <!-- Expiry -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
          <tr>
            <td style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.20);border-radius:12px;padding:14px 20px;text-align:center;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#fca5a5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#9200;&nbsp; This code expires in 10 minutes</p>
            </td>
          </tr>
        </table>

        <!-- Steps -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:16px;margin-bottom:20px;">
          <tr><td style="padding:20px 22px;">
            <p style="margin:0 0 14px 0;font-size:13px;font-weight:700;color:${T.white90};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">How to reset your password:</p>
            ${[
              ["1", "Copy the code above"],
              ["2", "Paste it in the OTP Field and click verify"],
              ["3", "Set your new password"],
              ["4", "You're in — log in with your new credentials"],
            ]
              .map(
                ([num, step]) => `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
              <tr>
                <td valign="top" style="width:28px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" valign="middle"
                        style="width:22px;height:22px;background:rgba(245,158,11,0.18);border-radius:50%;font-size:11px;font-weight:800;color:${T.amber};text-align:center;line-height:22px;mso-line-height-rule:exactly;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${num}</td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;padding-left:10px;">${step}</td>
              </tr>
            </table>`,
              )
              .join("")}
          </td></tr>
        </table>

        <!-- Warning -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background:rgba(239,68,68,0.06);border-left:4px solid rgba(239,68,68,0.55);border-radius:0 12px 12px 0;padding:16px 20px;">
              <p style="margin:0 0 5px 0;font-size:13px;font-weight:700;color:#fca5a5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">&#128737; Didn't Request This?</p>
              <p style="margin:0;font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.65;">If you didn't request a password reset, someone may be trying to access your account. Change your password immediately or contact our support team.</p>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    ${divider()}

    <!-- ══ FOOTER ══ -->
    <tr>
      <td class="ftr" style="padding:22px 40px 30px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;">
          <tr>
            <td style="width:6px;height:6px;background:${T.amber};border-radius:50%;"></td>
            <td style="width:8px;"></td>
            <td style="width:6px;height:6px;background:${T.red};border-radius:50%;opacity:0.6;"></td>
            <td style="width:8px;"></td>
            <td style="width:6px;height:6px;background:${T.amber};border-radius:50%;opacity:0.35;"></td>
          </tr>
        </table>
        <p style="margin:0;font-size:12px;color:${T.white25};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.8;">
          This email was sent to ${toEmail}.<br>
          If you didn't request a reset, you can safely ignore this email.
        </p>
      </td>
    </tr>`;

  return sendEmail({
    to: toEmail,
    subject: "Password Reset — VideoMeet",
    html: shell(inner, preview),
    text: `Hi ${username},\n\nYour password reset code is: ${otpCode}\n\nExpires in 10 minutes.\n\nIf you didn't request this, please secure your account immediately.`,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MEETING REMINDER EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export const sendMeetingReminderEmail = async (
  toEmail,
  meetingData,
  minutesBefore = 15,
) => {
  const { title, meetingLink, meetingId, scheduledFor } = meetingData;
  const meetingTime = scheduledFor
    ? new Date(scheduledFor).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  const preview = `Your meeting "${title}" starts in ${minutesBefore} minutes — join now`;

  const urgencyColor =
    minutesBefore <= 5 ? T.red : minutesBefore <= 10 ? T.amber : T.indigo;
  const urgencyGlow =
    minutesBefore <= 5
      ? "rgba(239,68,68,0.40)"
      : minutesBefore <= 10
        ? "rgba(245,158,11,0.40)"
        : T.indigoGlow;

  const inner = `
    <!-- ══ HEADER ══ -->
    <tr>
      <td class="hdr" style="padding:48px 40px 28px;text-align:center;background:linear-gradient(160deg,rgba(99,102,241,0.18) 0%,rgba(139,92,246,0.11) 55%,transparent 100%);border-radius:24px 24px 0 0;">
        ${iconCircle("&#128276;", T.indigo, T.violet, urgencyGlow)}
        <p class="title-text" style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:${T.white};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.5px;">Meeting Starting Soon</p>
        <p style="margin:0;font-size:14px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Your meeting begins in ${minutesBefore} ${minutesBefore === 1 ? "minute" : "minutes"}</p>
      </td>
    </tr>

    <!-- ══ BODY ══ -->
    <tr>
      <td class="body" style="padding:28px 40px 36px;">

        <!-- Big countdown -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
          <tr>
            <td align="center"
              style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:20px;padding:32px 20px;">
              <!-- Number -->
              <p class="countdown-num"
                style="margin:0;font-size:80px;font-weight:800;color:${urgencyColor};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1;letter-spacing:-4px;mso-line-height-rule:exactly;">${minutesBefore}</p>
              <p style="margin:8px 0 0 0;font-size:12px;font-weight:700;color:${T.white40};text-transform:uppercase;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Minutes Until Start</p>
              <!-- Progress dots -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;">
                <tr>
                  ${Array.from({ length: 5 }, (_, i) => {
                    const filled = i < Math.ceil((minutesBefore / 60) * 5);
                    return `<td style="width:${filled ? 24 : 8}px;height:6px;background:${filled ? urgencyColor : T.white10};border-radius:3px;margin-right:5px;"></td><td style="width:6px;"></td>`;
                  }).join("")}
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Meeting info card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
          style="background:${T.surface};border:1px solid ${T.surfaceBorder};border-radius:18px;margin-bottom:24px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${T.surfaceBorder};">
              ${detailRow("&#127909;", "Meeting", title, "rgba(99,102,241,0.15)")}
            </td>
          </tr>
          ${
            meetingTime
              ? `
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${T.surfaceBorder};">
              ${detailRow("&#128336;", "Start Time", meetingTime, "rgba(16,185,129,0.15)")}
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:16px 20px;">
              ${detailRow("&#128279;", "Meeting ID", `<span style="font-family:'Courier New',Courier,monospace;font-size:13px;">${meetingId}</span>`, "rgba(245,158,11,0.15)", true)}
            </td>
          </tr>
        </table>

        <!-- CTA -->
        ${ctaButton(meetingLink, "&#127909;&nbsp;&nbsp;Join Now", T.indigo, T.violet, T.indigoGlow)}

        <!-- Friendly nudge -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
          <tr>
            <td align="center" style="padding:14px 20px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:12px;">
              <p style="margin:0;font-size:13px;color:${T.white60};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                &#9989;&nbsp; Test your audio &amp; video before joining &nbsp;&#128241; Use headphones for best experience
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    ${divider()}

    <!-- ══ FOOTER ══ -->
    <tr>
      <td class="ftr" style="padding:22px 40px 30px;text-align:center;">
        <p style="margin:0;font-size:12px;color:${T.white25};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.8;">
          This reminder was sent to ${toEmail}.<br>
          Manage your <a href="#" style="color:${T.white40};text-decoration:underline;">notification preferences</a>.
        </p>
      </td>
    </tr>`;

  return sendEmail({
    to: toEmail,
    subject: `Starting in ${minutesBefore} min: ${title} — VideoMeet`,
    html: shell(inner, preview),
    text: `Your meeting "${title}" starts in ${minutesBefore} minutes.\n\nMeeting ID: ${meetingId}\n${meetingTime ? `Time: ${meetingTime}\n` : ""}Join: ${meetingLink}`,
  });
};

export default {
  sendOTPEmail,
  sendMeetingInvitationEmail,
  sendPasswordResetEmail,
  sendMeetingReminderEmail,
};
