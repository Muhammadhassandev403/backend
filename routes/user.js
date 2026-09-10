import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Create or get user
router.post('/init', async (req, res) => {
  try {
    let token = req.headers['x-user-token'];
    
    console.log('Init user called. Token:', token);
    
    // If no token provided, create a new one
    if (!token) {
      token = randomUUID();
      console.log('Created new token:', token);
      
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          token: token,
          chapters_used: 0,
          has_paid: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Insert error:', insertError);
        return res.status(500).json({ error: insertError.message });
      }
      
      return res.json({
        token: token,
        user: newUser,
        is_new: true
      });
    }

    // Check if user exists
    const { data: user, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('token', token)
      .single();

    if (selectError && selectError.code === 'PGRST116') {
      // User doesn't exist, create them
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          token: token,
          chapters_used: 0,
          has_paid: false,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Insert error:', insertError);
        return res.status(500).json({ error: insertError.message });
      }
      
      return res.json({
        token: token,
        user: newUser,
        is_new: true
      });
    }

    if (selectError) {
      console.error('Select error:', selectError);
      return res.status(500).json({ error: selectError.message });
    }

    res.json({
      token: token,
      user: user,
      is_new: false
    });
    
  } catch (err) {
    console.error('Init user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user status
router.get('/status', async (req, res) => {
  try {
    const token = req.headers['x-user-token'];
    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      console.error('Status error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      has_paid: user?.has_paid || false,
      chapters_used: user?.chapters_used || 0,
      free_chapters_left: user?.has_paid ? Infinity : Math.max(0, 3 - (user?.chapters_used || 0)),
      can_play_free: user?.chapters_used < 3 || user?.has_paid
    });
    
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get resume data
router.get('/resume', async (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: user } = await supabase
    .from('users')
    .select('last_chapter_id, scenario, has_paid')
    .eq('token', token)
    .single();

  if (!user?.last_chapter_id) {
    return res.json({ has_save: false });
  }

  const { data: chapter } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', user.last_chapter_id)
    .single();

  const { data: history } = await supabase
    .from('chapters')
    .select('id, chapter_number, title')
    .eq('user_token', token)
    .order('chapter_number', { ascending: true });

  res.json({
    has_save: true,
    current_chapter: chapter,
    history: history,
    scenario: user.scenario,
    is_paid: user.has_paid
  });
});

// Save progress
router.post('/save-progress', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { chapterId, scenario } = req.body;

  await supabase
    .from('users')
    .update({ 
      last_chapter_id: chapterId,
      scenario: scenario || undefined
    })
    .eq('token', token);

  res.json({ success: true });
});

export default router;
