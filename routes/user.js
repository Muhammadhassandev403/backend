import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Create or get user
router.post('/init', async (req, res) => {
  let token = req.headers['x-user-token'];
  
  if (!token) {
    token = randomUUID();
    await supabase.from('users').insert({
      token: token,
      chapters_used: 0,
      has_paid: false,
      created_at: new Date().toISOString()
    });
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('token', token)
    .single();

  if (!user) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        token: token,
        chapters_used: 0,
        has_paid: false
      })
      .select()
      .single();
    
    return res.json({
      token: token,
      user: newUser,
      is_new: true
    });
  }

  res.json({
    token: token,
    user: user,
    is_new: false
  });
});

// Get user status
router.get('/status', async (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('token', token)
    .single();

  res.json({
    has_paid: user?.has_paid || false,
    chapters_used: user?.chapters_used || 0,
    free_chapters_left: user?.has_paid ? Infinity : Math.max(0, 3 - (user?.chapters_used || 0)),
    can_play_free: user?.chapters_used < 3 || user?.has_paid
  });
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