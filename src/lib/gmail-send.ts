import { getGoogleAccessToken } from "@/lib/google-auth";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  const lines: string[] = [
    `To: ${toLine}`,
    ccLine ? `Cc: ${ccLine}` : "",
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.html, "utf8").toString("base64"),
  ];
  if (opts.attachments?.length) {
    for (const att of opts.attachments) {
      lines.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="${att.filename.replace(/"/g, '\\"')}"`,
        "Content-Disposition: attachment; filename=\"" + att.filename.replace(/"/g, '\\"') + "\"",
        "Content-Transfer-Encoding: base64",
        "",
        att.content.toString("base64"),
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

  if (!res.ok) {
    const text = await res.text();
    return { error: `Gmail API: ${res.status} ${text.slice(0, 200)}` };
  }
  return {};
}
