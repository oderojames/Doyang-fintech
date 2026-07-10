import { Resend } from 'resend';
import { logger } from './logger.js';

const FROM = 'Doyang <noreply@doyang.biz>';

function getResend(): Resend {
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('RESEND_API_KEY environment variable is not set');
  return new Resend(key);
}

// ── Shared template wrapper ─────────────────────────────────────────────────

function baseTemplate(preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Doyang</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background-color:#0f1117;border-radius:16px;padding:14px 20px;display:inline-block;">
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="vertical-align:middle;padding-right:10px;">
                          <!-- Shield icon (SVG inline) -->
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z" fill="#3b82f6"/>
                            <path d="M10 13.17L8.24 11.41L7 12.65L10 15.65L16 9.65L14.76 8.41L10 13.17Z" fill="white"/>
                          </svg>
                        </td>
                        <td style="vertical-align:middle;">
                          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Doyang</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;padding:40px 40px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 4px 24px rgba(0,0,0,0.06);">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                This email was sent by Doyang · <a href="https://doyang.biz" style="color:#64748b;text-decoration:none;">doyang.biz</a>
              </p>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:11px;">
                If you did not request this, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Verification email template ─────────────────────────────────────────────

function verificationTemplate(displayName: string | undefined, verificationLink: string): string {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi there,';
  return baseTemplate(
    'Verify your email address to activate your Doyang account.',
    `
    <!-- Icon -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#eff6ff;border-radius:12px;padding:14px;display:inline-block;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 6L12 13L2 6" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.2;">Verify your email</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">${greeting} Welcome to Doyang. Please confirm your email address to activate your account and start using the platform.</p>

    <!-- Divider -->
    <div style="height:1px;background-color:#f1f5f9;margin-bottom:28px;"></div>

    <!-- CTA Button -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
      <tr>
        <td style="border-radius:10px;background-color:#3b82f6;">
          <a href="${verificationLink}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.1px;border-radius:10px;">
            Verify email address
          </a>
        </td>
      </tr>
    </table>

    <!-- Expiry note -->
    <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;line-height:1.5;">
      This link expires in <strong style="color:#64748b;">24 hours</strong>. After that, you can request a new verification link from the sign-in page.
    </p>

    `
  );
}

// ── Password reset email template ───────────────────────────────────────────

function passwordResetTemplate(displayName: string | undefined, resetLink: string): string {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi there,';
  return baseTemplate(
    'Reset your Doyang account password.',
    `
    <!-- Icon -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#fef3c7;border-radius:12px;padding:14px;display:inline-block;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 11V7C7 4.79 8.79 3 11 3H13C15.21 3 17 4.79 17 7V11" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="16" r="1" fill="#d97706"/>
          </svg>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.2;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">${greeting} We received a request to reset the password for your Doyang account. Click the button below to choose a new password.</p>

    <!-- Divider -->
    <div style="height:1px;background-color:#f1f5f9;margin-bottom:28px;"></div>

    <!-- CTA Button -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
      <tr>
        <td style="border-radius:10px;background-color:#3b82f6;">
          <a href="${resetLink}"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.1px;border-radius:10px;">
            Reset password
          </a>
        </td>
      </tr>
    </table>

    <!-- Expiry + security note -->
    <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;line-height:1.5;">
      This link expires in <strong style="color:#64748b;">1 hour</strong>. If you did not request a password reset, no action is needed — your password will remain unchanged.
    </p>

    `
  );
}

// ── Public send functions ───────────────────────────────────────────────────

export async function sendVerificationEmail(
  email: string,
  verificationLink: string,
  displayName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Verify your Doyang account',
      html: verificationTemplate(displayName, verificationLink),
    });

    if (error) {
      logger.error({ error, email }, '[email] sendVerificationEmail: Resend API error');
      return { success: false, error: error.message };
    }

    logger.info({ email }, '[email] Verification email sent');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, email }, '[email] sendVerificationEmail: unexpected error');
    return { success: false, error: message };
  }
}

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  displayName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Reset your Doyang password',
      html: passwordResetTemplate(displayName, resetLink),
    });

    if (error) {
      logger.error({ error, email }, '[email] sendPasswordResetEmail: Resend API error');
      return { success: false, error: error.message };
    }

    logger.info({ email }, '[email] Password reset email sent');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, email }, '[email] sendPasswordResetEmail: unexpected error');
    return { success: false, error: message };
  }
}
