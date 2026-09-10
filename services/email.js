import nodemailer from 'nodemailer';

// ============================================
// EMAIL CONFIGURATION
// ============================================

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ============================================
// 1. SEND PAYMENT CONFIRMATION EMAIL
// ============================================

export async function sendPaymentConfirmation(email, userToken, transactionRef) {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  
  const subject = '⚔️ Spellcast - Your Legend Has Been Unlocked!';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Georgia, serif; background: #0a0a12; color: #e0d6c8; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1512; border-radius: 12px; padding: 40px; border: 2px solid #f0c060; }
        h1 { color: #f0c060; text-align: center; font-size: 32px; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 25px; }
        .gold { color: #f0c060; }
        .button { display: inline-block; background: #f0c060; color: #0a0a12; padding: 14px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #ffd070; }
        .footer { color: #666; font-size: 12px; text-align: center; margin-top: 30px; border-top: 1px solid #2a1f1a; padding-top: 20px; }
        .ref { background: #0a0a12; padding: 10px 15px; border-radius: 4px; font-family: monospace; color: #f0c060; border: 1px solid #2a1f1a; }
        .unlock-list { background: #0a0a12; border-radius: 8px; padding: 15px 20px; margin: 15px 0; }
        .unlock-list li { padding: 5px 0; color: #aaa; }
        .divider { border: none; border-top: 1px solid #2a1f1a; margin: 20px 0; }
        .bank-details { background: #0a0a12; padding: 15px; border-radius: 6px; border-left: 3px solid #f0c060; }
        .bank-details strong { color: #f0c060; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚔️ Spellcast</h1>
        <p class="subtitle">Interactive Fantasy Adventure</p>
        
        <div style="text-align: center; font-size: 20px; padding: 10px; background: #f0c06015; border-radius: 8px; border: 1px solid #f0c060;">
          🎉 <strong style="color: #f0c060;">Payment Confirmed!</strong>
        </div>
        
        <div style="margin: 20px 0; padding: 15px; background: #0a0a12; border-radius: 8px; border: 1px solid #2a1f1a;">
          <p style="margin: 5px 0;"><strong>Transaction Reference:</strong> <span class="ref">${transactionRef}</span></p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #51cf66;">✅ Verified</span></p>
          <p style="margin: 5px 0;"><strong>Unlocked:</strong> <span class="gold">Infinite Chapters Forever</span></p>
          <p style="margin: 5px 0;"><strong>Account:</strong> <span class="gold">9123271114</span></p>
        </div>
        
        <p style="font-size: 17px;">Your legend continues! You now have <strong class="gold">unlimited access</strong> to all features.</p>
        
        <div style="text-align: center;">
          <a href="${appUrl}" class="button">⚔️ Continue Your Adventure</a>
        </div>
        
        <hr class="divider">
        
        <p style="color: #888; font-size: 14px; margin-bottom: 8px;">✨ What's unlocked for you:</p>
        <ul class="unlock-list">
          <li>✅ <strong>Infinite story chapters</strong> — Your adventure never ends</li>
          <li>✅ <strong>Edit any chapter</strong> — Rewrite your legend</li>
          <li>✅ <strong>Branching timelines</strong> — Explore alternate paths</li>
          <li>✅ <strong>Export as PDF or EPUB</strong> — Share your story</li>
          <li>✅ <strong>Dice rolls</strong> (D20, D12, D6) — Let fate decide</li>
          <li>✅ <strong>Publish to Community Library</strong> — Become a legend</li>
          <li>✅ <strong>Upvote & comment</strong> — Join the community</li>
        </ul>
        
        <hr class="divider">
        
        <div class="bank-details">
          <p style="margin: 3px 0;"><strong>Payment Confirmed To:</strong></p>
          <p style="margin: 3px 0;">Account: <strong>9123271114</strong></p>
          <p style="margin: 3px 0;">Amount: <strong>N2,000</strong></p>
          <p style="margin: 3px 0; color: #888; font-size: 13px;">Verified on: ${new Date().toLocaleString()}</p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 20px; text-align: center;">
          Thank you for supporting Spellcast!<br>
          May your legend grow forever. 🏰
        </p>
        
        <div class="footer">
          Spellcast — Interactive Fantasy Adventure<br>
          ${new Date().toLocaleDateString()} • Account: 9123271114
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    ⚔️ SPELLCAST - PAYMENT CONFIRMED!
    
    Transaction Reference: ${transactionRef}
    Status: ✅ Verified
    Unlocked: Infinite Chapters Forever
    Account: 9123271114
    
    Your legend continues! You now have unlimited access to all chapters, edits, exports, and the community library.
    
    Continue your adventure: ${appUrl}
    
    What's unlocked:
    ✅ Infinite story chapters
    ✅ Edit any chapter & create branches
    ✅ Export as PDF or EPUB
    ✅ Dice rolls (D20, D12, D6)
    ✅ Publish to Community Library
    ✅ Upvote & comment on other stories
    
    Payment confirmed to account: 9123271114
    Amount: N2,000
    
    Thank you for supporting Spellcast!
    May your legend grow forever. 🏰
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Spellcast" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      text: text,
      html: html
    });
    
    console.log(`✅ Confirmation email sent to ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Email failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// 2. SEND PAYMENT PENDING EMAIL
// ============================================

export async function sendPaymentPending(email, transactionRef) {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Georgia, serif; background: #0a0a12; color: #e0d6c8; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1512; border-radius: 12px; padding: 40px; border: 2px solid #fcc419; }
        h1 { color: #fcc419; text-align: center; font-size: 32px; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 25px; }
        .button { display: inline-block; background: #fcc419; color: #0a0a12; padding: 14px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
        .ref { background: #0a0a12; padding: 10px 15px; border-radius: 4px; font-family: monospace; color: #fcc419; border: 1px solid #2a1f1a; }
        .footer { color: #666; font-size: 12px; text-align: center; margin-top: 30px; border-top: 1px solid #2a1f1a; padding-top: 20px; }
        .bank-details { background: #0a0a12; padding: 15px; border-radius: 6px; border-left: 3px solid #fcc419; }
        .bank-details strong { color: #fcc419; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚔️ Spellcast</h1>
        <p class="subtitle">Interactive Fantasy Adventure</p>
        
        <div style="text-align: center; font-size: 18px; padding: 10px; background: #fcc41915; border-radius: 8px; border: 1px solid #fcc419;">
          📝 <strong style="color: #fcc419;">Payment Received — Pending Verification</strong>
        </div>
        
        <div style="margin: 20px 0; padding: 15px; background: #0a0a12; border-radius: 8px; border: 1px solid #2a1f1a;">
          <p style="margin: 5px 0;"><strong>Transaction Reference:</strong> <span class="ref">${transactionRef}</span></p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #fcc419;">⏳ Pending Verification</span></p>
          <p style="margin: 5px 0;"><strong>Account:</strong> <span style="color: #fcc419;">9123271114</span></p>
        </div>
        
        <p>We've received your payment reference. Our team will verify it within <strong>24 hours</strong>.</p>
        
        <div class="bank-details">
          <p style="margin: 3px 0;"><strong>You sent payment to:</strong></p>
          <p style="margin: 3px 0;">Account: <strong>9123271114</strong></p>
          <p style="margin: 3px 0;">Amount: <strong>N2,000</strong></p>
        </div>
        
        <p style="color: #888;">You'll receive another email once your account is unlocked.</p>
        
        <div style="text-align: center;">
          <a href="${appUrl}" class="button">📖 Return to Your Story</a>
        </div>
        
        <div class="footer">
          Spellcast — Interactive Fantasy Adventure<br>
          ${new Date().toLocaleDateString()} • Account: 9123271114
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"Spellcast" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '📝 Spellcast - Payment Received (Pending Verification)',
      html: html,
      text: `
        ⚔️ SPELLCAST - PAYMENT RECEIVED (PENDING)
        
        Transaction Reference: ${transactionRef}
        Status: ⏳ Pending Verification
        Account: 9123271114
        Amount: $1,000
        
        We've received your payment reference. Our team will verify it within 24 hours.
        
        You'll receive another email once your account is unlocked.
        
        Return to your story: ${appUrl}
      `
    });
    console.log(`📝 Pending email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Pending email failed:', error);
    return { success: false, error: error.message };
  }
}