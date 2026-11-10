import nodemailer, { type Transporter } from 'nodemailer';
import { getSettings, type PlatformSettings } from './settings';

/**
 * Email delivery.
 *
 * SMTP credentials live in the database (admin editable) or in environment
 * variables, never in the frontend bundle. When email is disabled — the default
 * for a fresh install — messages are logged to the server console so flows like
 * password reset remain testable without an SMTP server.
 */

let cachedTransporter: { key: string; transporter: Transporter } | null = null;

function smtpConfigured(settings: PlatformSettings): boolean {
  const email = settings.email;
  return Boolean(
    email.enabled &&
      email.provider === 'smtp' &&
      email.smtpHost &&
      (process.env.SMTP_HOST || email.smtpHost),
  );
}

function buildTransporter(settings: PlatformSettings): Transporter | null {
  if (!smtpConfigured(settings)) return null;
  const email = settings.email;
  const host = process.env.SMTP_HOST || email.smtpHost;
  const port = Number(process.env.SMTP_PORT ?? email.smtpPort ?? 587);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : email.smtpSecure;
  const user = process.env.SMTP_USER || email.smtpUser;
  const pass = process.env.SMTP_PASSWORD || email.smtpPassword;

  const key = `${host}:${port}:${secure}:${user}`;
  if (cachedTransporter?.key === key) return cachedTransporter.transporter;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10_000,
  });
  cachedTransporter = { key, transporter };
  return transporter;
}

export type MailResult = { sent: boolean; error?: string };

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  const settings = await getSettings();
  const transporter = buildTransporter(settings);

  if (!transporter) {
    console.info(
      `[mail] (not configured) to=${params.to} subject="${params.subject}" — enable email in Admin → Settings → Email`,
    );
    return { sent: false, error: 'Email is not configured.' };
  }

  try {
    await transporter.sendMail({
      from: `"${settings.email.fromName}" <${settings.email.fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text ?? params.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed', (err as Error).message);
    return { sent: false, error: (err as Error).message };
  }
}

/** Shared responsive email shell, branded with the admin's colours. */
export function emailLayout(options: {
  brandColor: string;
  platformName: string;
  footerText: string;
  body: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${options.platformName}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:${options.brandColor};padding:22px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${options.platformName}</span>
        </td></tr>
        <tr><td style="padding:28px;color:#0f172a;font-size:14px;line-height:1.65;">
          ${options.body}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.5;">
          ${options.footerText}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function welcomeEmailTemplate(params: {
  name: string;
  email: string;
  password: string;
  platformName: string;
  loginUrl: string;
  quotaGb: number;
}): string {
  return `<h1 style="margin:0 0 12px;font-size:19px;">Welcome, ${params.name}</h1>
<p style="margin:0 0 16px;">An account has been created for you on <strong>${params.platformName}</strong> with <strong>${params.quotaGb} GB</strong> of storage.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 18px;">
  <tr><td style="padding:4px 0;color:#64748b;font-size:12px;">Email</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${params.email}</td></tr>
  <tr><td style="padding:4px 0;color:#64748b;font-size:12px;">Password</td><td style="padding:4px 0;font-weight:600;font-size:13px;font-family:monospace;">${params.password}</td></tr>
</table>
<p style="margin:0 0 18px;color:#64748b;font-size:12px;">You will be asked to choose a new password on first sign-in.</p>
<p style="margin:0;"><a href="${params.loginUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:13px;">Sign in</a></p>`;
}

export function passwordResetTemplate(params: {
  name: string;
  platformName: string;
  resetUrl: string;
  expiresMinutes: number;
}): string {
  return `<h1 style="margin:0 0 12px;font-size:19px;">Reset your password</h1>
<p style="margin:0 0 16px;">Hi ${params.name}, we received a request to reset your ${params.platformName} password.</p>
<p style="margin:0 0 20px;"><a href="${params.resetUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:13px;">Choose a new password</a></p>
<p style="margin:0;color:#64748b;font-size:12px;">This link expires in ${params.expiresMinutes} minutes. If you did not request it, you can safely ignore this email.</p>`;
}

export function quotaWarningTemplate(params: {
  name: string;
  platformName: string;
  percentUsed: number;
  quotaGb: string;
  usedGb: string;
}): string {
  return `<h1 style="margin:0 0 12px;font-size:19px;">You are running low on storage</h1>
<p style="margin:0 0 12px;">Hi ${params.name}, you have used <strong>${params.percentUsed}%</strong> of your ${params.quotaGb} GB on ${params.platformName} (${params.usedGb} used).</p>
<p style="margin:0;color:#64748b;font-size:12px;">Delete files you no longer need, or contact your administrator to request a larger quota.</p>`;
}
