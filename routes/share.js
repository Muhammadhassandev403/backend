import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Generate share link
router.post('/generate', async (req, res) => {
  const { chapterId } = req.body;
  const token = req.headers['x-user-token'];

  const { data: chapter } = await supabase
    .from('chapters')
    .select('user_token')
    .eq('id', chapterId)
    .single();

  if (chapter.user_token !== token) {
    return res.status(403).json({ error: 'Not your chapter' });
  }

  const { data: updated } = await supabase
    .from('chapters')
    .update({ is_shared: true })
    .eq('id', chapterId)
    .select('share_id')
    .single();

  const shareUrl = `${process.env.FRONTEND_URL}/share/${updated.share_id}`;
  res.json({ share_url: shareUrl, share_id: updated.share_id });
});

// View shared chapter
router.get('/:shareId', async (req, res) => {
  const { shareId } = req.params;

  const { data: chapter } = await supabase
    .from('chapters')
    .select(`
      id,
      chapter_number,
      title,
      narrative,
      image_url,
      users!inner (has_paid)
    `)
    .eq('share_id', shareId)
    .eq('is_shared', true)
    .single();

  if (!chapter) {
    return res.status(404).json({ error: 'Story not found or not shared' });
  }

  const { data: allChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, share_id, is_shared')
    .eq('user_token', chapter.users?.token || '')
    .order('chapter_number', { ascending: true });

  res.json({
    chapter: {
      ...chapter,
      users: undefined
    },
    series: allChapters?.filter(c => c.is_shared) || []
  });
});

export default router;