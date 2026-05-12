declare module "nodemailer" {
  export interface Transport {
    sendMail(mail: SendMailOptions): Promise<SentMessageInfo>;
  }
  export interface SendMailOptions {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; content: Buffer }>;
  }
  export interface SentMessageInfo {
    messageId?: string;
    message?: Buffer;
    envelope?: unknown;
  }
  export function createTransport(options: {
    streamTransport?: boolean;
    buffer?: boolean;
    newline?: string;
  }): Transport;
}
