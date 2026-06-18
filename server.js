require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'subscribers.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CrochetingHeals';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Subscribers helpers ──────────────────────────────────
function loadSubscribers() {
  if (!fs.existsSync(SUBSCRIBERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveSubscribers(subs) {
  fs.mkdirSync(path.dirname(SUBSCRIBERS_FILE), { recursive: true });
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2));
}

// ── Auth middleware ──────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Public: Signup page ──────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Public: Subscribe ────────────────────────────────────
app.post('/subscribe', async (req, res) => {
  const { email, firstName } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  const subs = loadSubscribers();
  const exists = subs.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'Already subscribed.' });
  }

  const newSub = {
    id: Date.now().toString(),
    email: email.toLowerCase().trim(),
    firstName: firstName?.trim() || '',
    subscribedAt: new Date().toISOString()
  };
  subs.push(newSub);
  saveSubscribers(subs);

  // Send welcome email to subscriber
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'IYIÉ Style <onboarding@resend.dev>',
      to: email,
      subject: `Welcome to the circle${firstName ? `, ${firstName}` : ''} ✦`,
      html: welcomeEmailHTML(firstName || 'babe', email)
    });
  } catch (err) {
    console.error('Welcome email failed:', err.message);
  }

  // Notify admin of new signup
  if (process.env.ADMIN_EMAIL) {
    try {
      const total = subs.length;
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'IYIÉ Style <onboarding@resend.dev>',
        to: process.env.ADMIN_EMAIL,
        subject: `✦ New signup — ${firstName || email}`,
        html: adminNotifyHTML({ firstName: firstName || '', email, total })
      });
    } catch (err) {
      console.error('Admin notify failed:', err.message);
    }
  }

  res.json({ success: true, message: 'You\'re in the circle.' });
});

// ── Public: Unsubscribe ──────────────────────────────────
app.get('/unsubscribe', (req, res) => {
  const { email } = req.query;
  if (!email) return res.send('Invalid link.');
  let subs = loadSubscribers();
  subs = subs.filter(s => s.email !== email.toLowerCase());
  saveSubscribers(subs);
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:4rem;background:#F7F1E0;">
      <h2 style="color:#AA1313;font-size:1.5rem;">You've been removed.</h2>
      <p style="color:#888;margin-top:1rem;">Sorry to see you go. You won't hear from us again.</p>
    </body></html>
  `);
});

// ── Admin: Login check ───────────────────────────────────
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Wrong password.' });
  }
});

// ── Admin: Get subscribers ───────────────────────────────
app.get('/admin/subscribers', requireAuth, (req, res) => {
  const subs = loadSubscribers();
  res.json({ count: subs.length, subscribers: subs });
});

// ── Admin: Delete subscriber ─────────────────────────────
app.delete('/admin/subscribers/:id', requireAuth, (req, res) => {
  let subs = loadSubscribers();
  subs = subs.filter(s => s.id !== req.params.id);
  saveSubscribers(subs);
  res.json({ success: true });
});

// ── Admin: Blast email ───────────────────────────────────
app.post('/admin/blast', requireAuth, async (req, res) => {
  const { subject, html, previewText } = req.body;
  if (!subject || !html) {
    return res.status(400).json({ error: 'Subject and body required.' });
  }

  const subs = loadSubscribers();
  if (subs.length === 0) {
    return res.status(400).json({ error: 'No subscribers yet.' });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const sub of subs) {
    try {
      const personalizedHtml = blastEmailHTML({
        subject,
        previewText: previewText || '',
        body: html,
        email: sub.email,
        firstName: sub.firstName
      });

      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'IYIÉ Style <onboarding@resend.dev>',
        to: sub.email,
        subject,
        html: personalizedHtml
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: sub.email, error: err.message });
    }

    // small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  res.json({ success: true, ...results });
});

// ── Email templates ──────────────────────────────────────
function adminNotifyHTML({ firstName, email, total }) {
  const name = firstName ? `<strong>${firstName}</strong> (${email})` : `<strong>${email}</strong>`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px 24px;background:#0c0c0c;font-family:Arial,sans-serif;color:#e8e0d4;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
  <tr><td style="padding-bottom:24px;border-bottom:1px solid #222;">
    <span style="font-size:11px;letter-spacing:5px;color:#F7838D;">IYIÉ STYLE</span>
  </td></tr>
  <tr><td style="padding:28px 0 12px;">
    <p style="font-size:22px;font-weight:300;margin:0 0 8px;color:#f5f0e8;">New subscriber ✦</p>
    <p style="font-size:14px;color:#888;margin:0;">${name} just joined the list.</p>
  </td></tr>
  <tr><td style="padding:16px 20px;background:#141414;border-radius:4px;">
    <p style="margin:0;font-size:12px;color:#555;letter-spacing:2px;text-transform:uppercase;">Total subscribers</p>
    <p style="margin:6px 0 0;font-size:32px;font-weight:300;color:#F7838D;">${total}</p>
  </td></tr>
  <tr><td style="padding-top:24px;">
    <p style="font-size:11px;color:#444;margin:0;">Sent from your IYIÉ admin · <a href="${process.env.SITE_URL || 'http://localhost:3000'}/admin.html" style="color:#F7838D;text-decoration:none;">Open dashboard</a></p>
  </td></tr>
</table>
</body></html>`;
}

function welcomeEmailHTML(firstName, email) {
  const unsubUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:ital,wght@0,300;1,300&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#F7F1E0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

  <tr><td style="background:#F7838D;padding:48px 40px 36px;text-align:center;">
    <div style="font-size:13px;letter-spacing:10px;color:rgba(255,255,255,0.6);margin-bottom:16px;">✦ ✦ ✦</div>
    <div style="font-family:'Noto Serif Display',Georgia,serif;font-size:52px;font-weight:300;color:#fff;letter-spacing:6px;line-height:1;">IYI<em>É</em></div>
    <div style="font-size:9px;letter-spacing:6px;color:rgba(255,255,255,0.8);margin-top:6px;">STYLE</div>
  </td></tr>

  <tr><td style="background:#fff;padding:40px 40px 32px;text-align:center;">
    <p style="font-size:11px;letter-spacing:4px;color:#AA1313;font-weight:700;margin:0 0 16px;">You're in.</p>
    <h1 style="font-family:'Noto Serif Display',Georgia,serif;font-size:30px;font-weight:300;color:#1a1109;margin:0 0 16px;line-height:1.3;">
      Welcome to the circle,<br><em style="color:#F7838D;">${firstName}.</em>
    </h1>
    <p style="font-size:14px;color:#8a7f72;line-height:1.8;margin:0 0 28px;max-width:360px;display:inline-block;">
      You'll be the first to know about new drops, exclusive edits, and everything IYIÉ — curated for the girl who does it well.
    </p>
    <br/>
    <a href="#" style="display:inline-block;background:#F7838D;color:#fff;text-decoration:none;padding:14px 32px;font-size:11px;letter-spacing:3px;border-radius:2px;">Shop the latest</a>
  </td></tr>

  <tr><td style="background:#F7F1E0;padding:28px 40px;text-align:center;border-top:1px solid #e8e0d4;">
    <p style="font-family:'Noto Serif Display',Georgia,serif;font-style:italic;font-size:14px;color:#F7838D;margin:0;">"to do it well"</p>
  </td></tr>

  <tr><td style="background:#1a1109;padding:24px 40px;text-align:center;">
    <p style="font-family:'Noto Serif Display',Georgia,serif;font-size:18px;color:#F7838D;letter-spacing:4px;margin:0 0 10px;">IYIÉ</p>
    <p style="font-size:10px;color:#555;margin:0;line-height:1.8;">
      You're receiving this because you joined the IYIÉ inner circle.<br/>
      <a href="${unsubUrl}" style="color:#F7838D;text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

function blastEmailHTML({ subject, previewText, body, email, firstName }) {
  const unsubUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(email)}`;
  const greeting = firstName ? firstName : 'there';
  const personalizedBody = body
    .replace(/{{firstName}}/g, greeting)
    .replace(/{{email}}/g, email);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:ital,wght@0,300;1,300&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#F7F1E0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

  <tr><td style="background:#F7838D;padding:32px 40px;text-align:center;">
    <div style="font-family:'Noto Serif Display',Georgia,serif;font-size:36px;font-weight:300;color:#fff;letter-spacing:5px;">IYI<em>É</em></div>
    <div style="font-size:9px;letter-spacing:5px;color:rgba(255,255,255,0.75);margin-top:4px;">STYLE</div>
  </td></tr>

  <tr><td style="background:#fff;padding:40px;">
    ${personalizedBody}
  </td></tr>

  <tr><td style="background:#1a1109;padding:24px 40px;text-align:center;">
    <p style="font-family:'Noto Serif Display',Georgia,serif;font-size:16px;color:#F7838D;letter-spacing:4px;margin:0 0 8px;">IYIÉ</p>
    <p style="font-size:10px;color:#555;margin:0;line-height:1.8;">
      You're receiving this because you joined the IYIÉ inner circle.<br/>
      <a href="${unsubUrl}" style="color:#F7838D;text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ IYIÉ Admin running at http://localhost:${PORT}`);
  console.log(`✦ Admin dashboard at http://localhost:${PORT}/admin.html\n`);
});
