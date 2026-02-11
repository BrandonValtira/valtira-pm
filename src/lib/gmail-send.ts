import { getGoogleAccessToken } from "@/lib/google-auth";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 2047: encode non-ASCII header value (e.g. Subject) as UTF-8 base64 so it displays correctly. */
function encodeHeaderValue(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

/**
 * Build a MIME message (RFC 2822) for HTML body + optional attachments.
 * From is left empty so Gmail uses the authenticated user's address.
 */
function buildMimeMessage(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): string {
  const boundary = "----=_Part_" + Math.random().toString(36).slice(2);
  const toLine = opts.to.join(", ");
  const ccLine = opts.cc?.length ? opts.cc.join(", ") : "";
  const dateLine = new Date().toUTCString();
  const subjectLine = encodeHeaderValue(opts.subject);
  const lines: string[] = [
    `To: ${toLine}`,
    ccLine ? `Cc: ${ccLine}` : "",
    `Subject: ${subjectLine}`,
    `Date: ${dateLine}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    (Buffer.from(opts.html, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n"),
  ];
  if (opts.attachments?.length) {
    for (const att of opts.attachments) {
      const b64 = att.content.toString("base64");
      const wrapped = b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
      lines.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${att.filename.replace(/"/g, '\\"')}"`,
        "Content-Disposition: attachment; filename=\"" + att.filename.replace(/"/g, '\\"') + "\"",
        "Content-Transfer-Encoding: base64",
        "",
        wrapped,
      );
    }
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export type SendEmailViaGmailOptions = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Send an email via the user's Gmail (using their connected Google account).
 * Requires the user to have connected Google in Settings with Gmail send scope.
 */
export async function sendEmailViaGmail(
  userId: string,
  opts: SendEmailViaGmailOptions
): Promise<{ error?: string }> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) {
    return { error: "Connect Google in Settings to send from your Valtira Gmail." };
  }
  if (opts.to.length === 0) {
    return { error: "At least one recipient is required." };
  }

  const mime = buildMimeMessage(opts);
  const raw = base64UrlEncode(Buffer.from(mime, "utf8"));

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[Gmail send] API error:", res.status, text.slice(0, 500));
    if (res.status === 403) {
      const hint = text.includes("disabled") || text.includes("not been used")
        ? " Enable the Gmail API in Google Cloud Console (APIs & Services → Enable APIs) for the project that owns your OAuth client, then reconnect Google in Settings."
        : " Reconnect Google in Settings and grant “Send email” when prompted.";
      return { error: `Gmail could not send (403).${hint}` };
    }
    if (res.status === 401) {
      return { error: "Google sign-in expired. Reconnect Google in Settings, then try again." };
    }
    return { error: text ? `Gmail: ${text.slice(0, 300)}` : `Gmail API error: ${res.status}` };
  }
  return {};
}
