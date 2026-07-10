import { Router, type IRouter } from 'express';
import { getAdminAuth } from '../lib/firebase-admin.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../lib/email.js';
import { logger } from '../lib/logger.js';

const router: IRouter = Router();

// ── POST /api/email/send-verification ──────────────────────────────────────
// Generates a Firebase email verification link via Admin SDK and sends it
// through Resend. Body: { email: string }
router.post('/email/send-verification', async (req, res) => {
  const { email, continueUrl } = req.body as { email?: string; continueUrl?: string };

  if (!email || typeof email !== 'string') {
    res.status(400).json({ success: false, error: 'email is required' });
    return;
  }

  try {
    const adminAuth = getAdminAuth();

    // Generate the Firebase-hosted verification link, redirecting back to the
    // app after the user clicks so they are logged straight in.
    const verificationLink = await adminAuth.generateEmailVerificationLink(email, {
      url: continueUrl ?? 'https://doyang.biz/retailer?verified=1',
    });

    // Fetch the user's display name for the email greeting
    const user = await adminAuth.getUserByEmail(email).catch(() => null);
    const displayName = user?.displayName ?? undefined;

    const result = await sendVerificationEmail(email, verificationLink, displayName);

    if (!result.success) {
      logger.error({ email, error: result.error }, '[route] send-verification: email send failed');
      res.status(500).json({ success: false, error: 'Failed to send verification email' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err, email }, '[route] send-verification: unexpected error');
    // Avoid exposing internal Firebase/admin details to clients.
    res.status(500).json({ success: false, error: 'Failed to send verification email' });
  }
});

// ── POST /api/email/send-password-reset ────────────────────────────────────
// Generates a Firebase password reset link via Admin SDK and sends it through
// Resend. Always responds 200 to prevent email enumeration. Body: { email: string }
router.post('/email/send-password-reset', async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string') {
    res.status(400).json({ success: false, error: 'email is required' });
    return;
  }

  try {
    const adminAuth = getAdminAuth();

    const resetLink = await adminAuth.generatePasswordResetLink(email);

    const user = await adminAuth.getUserByEmail(email).catch(() => null);
    const displayName = user?.displayName ?? undefined;

    await sendPasswordResetEmail(email, resetLink, displayName);

    // Always 200 — do not reveal whether the email exists
    res.json({ success: true });
  } catch (err) {
    // Log internally but return 200 to prevent enumeration
    logger.warn({ email, err: err instanceof Error ? err.message : err }, '[route] send-password-reset: failed (user may not exist)');
    res.json({ success: true });
  }
});

export default router;
