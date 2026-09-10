
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ============================================
// YOUR BANK DETAILS
// ============================================
const BANK_DETAILS = {
  accountNumber: '9123271114',
  bankName: 'OPAY', // CHANGE THIS
  accountName: 'Hassan Amjad Usman', // CHANGE THIS
  amount: '2000',
  currency: 'NGN',
  swiftCode: 'YOURSWIFTCODE', // CHANGE THIS
  reference: 'SPELLCAST-PAYMENT'
};

// ============================================
// 1. GET PAYMENT DETAILS (Shows to user)
// ============================================
router.get('/details', async (req, res) => {
  res.json({
    bank: BANK_DETAILS,
    instructions: `
      1. Transfer exactly N2000 to the bank account above
      2. Use your email as reference
      3. Enter the transaction reference below to verify
    `
  });
});

// ============================================
// 2. VERIFY PAYMENT (User enters reference)
// ============================================
router.post('/verify', async (req, res) => {
  const { transactionRef, email } = req.body;
  const token = req.headers['x-user-token'];

  if (!transactionRef || transactionRef.length < 5) {
    return res.status(400).json({ 
      error: 'Please enter a valid transaction reference' 
    });
  }

  // Check if this reference was already used
  const { data: existing } = await supabase
    .from('payments')
    .select('*')
    .eq('transaction_ref', transactionRef)
    .single();

  if (existing) {
    // Check if this reference was already used by someone else
    if (existing.user_token !== token) {
      return res.status(400).json({ 
        error: 'This reference has already been used by another user' 
      });
    }
    
    // Already verified for this user
    if (existing.verified) {
      return res.json({ 
        success: true, 
        already_verified: true,
        message: 'Your payment was already verified!'
      });
    }
  }

  // ============================================
  // OPTION 1: MANUAL VERIFICATION (Recommended)
  // Store the reference for admin to verify
  // ============================================
  
  // Save pending verification
  const { data: payment } = await supabase
    .from('payments')
    .insert({
      user_token: token,
      transaction_ref: transactionRef,
      email: email || 'pending@email.com',
      amount: 2000,
      status: 'pending',
      verified: false,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  // ============================================
  // OPTION 2: AUTO-VERIFY (For testing only)
  // Uncomment this block for auto-verification
  // ============================================
  /*
  // AUTOMATICALLY VERIFY (for testing)
  await supabase
    .from('payments')
    .update({ 
      status: 'completed', 
      verified: true,
      verified_at: new Date().toISOString()
    })
    .eq('id', payment.id);

  // Update user to PAID
  await supabase
    .from('users')
    .update({ 
      has_paid: true, 
      paid_at: new Date().toISOString(),
      chapters_used: 0
    })
    .eq('token', token);

  return res.json({
    success: true,
    verified: true,
    message: '✅ Payment verified! You now have unlimited chapters.'
  });
  */

  // ============================================
  // MANUAL VERIFICATION (Default)
  // Admin must verify in Supabase dashboard
  // ============================================
  res.json({
    success: true,
    verified: false,
    pending: true,
    message: '📝 Your transaction reference has been recorded. Please wait for verification (usually within 24 hours). You will be notified when your payment is confirmed.',
    reference: transactionRef
  });
});

// ============================================
// 3. CHECK PAYMENT STATUS
// ============================================
router.get('/status', async (req, res) => {
  const token = req.headers['x-user-token'];

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('user_token', token)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!payment) {
    return res.json({ has_payment: false });
  }

  res.json({
    has_payment: true,
    status: payment.status,
    verified: payment.verified,
    transaction_ref: payment.transaction_ref,
    created_at: payment.created_at,
    verified_at: payment.verified_at
  });
});

// ============================================
// 4. ADMIN: VERIFY PAYMENT (Manual)
// ============================================
router.post('/admin/verify', async (req, res) => {
  const { paymentId, adminKey } = req.body;

  // Simple admin check (change this key!)
  if (adminKey !== process.env.ADMIN_KEY || !adminKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Get payment details
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (payment.verified) {
    return res.json({ error: 'Already verified' });
  }

  // Mark as verified
  await supabase
    .from('payments')
    .update({ 
      status: 'completed', 
      verified: true,
      verified_at: new Date().toISOString()
    })
    .eq('id', paymentId);

  // Update user to PAID
  await supabase
    .from('users')
    .update({ 
      has_paid: true, 
      paid_at: new Date().toISOString(),
      chapters_used: 0
    })
    .eq('token', payment.user_token);

  res.json({
    success: true,
    message: `✅ User ${payment.user_token} verified and unlocked!`
  });
});

// ============================================
// 5. ADMIN: GET PENDING PAYMENTS
// ============================================
router.get('/admin/pending', async (req, res) => {
  const { adminKey } = req.query;

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('status', 'pending')
    .eq('verified', false)
    .order('created_at', { ascending: true });

  res.json(payments || []);
});

export default router;