import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Publish a story
router.post('/publish', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { branchId, title, description, genre = 'Fantasy' } = req.body;

  let query = supabase
    .from('chapters')
    .select('*')
    .eq('user_token', token)
    .order('chapter_number', { ascending: true });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  } else {
    const { data: activeBranch } = await supabase
      .from('story_branches')
      .select('id')
      .eq('user_token', token)
      .eq('is_active', true)
      .single();
    if (activeBranch) {
      query = query.eq('branch_id', activeBranch.id);
    }
  }

  const { data: chapters } = await query;

  if (!chapters || chapters.length < 3) {
    return res.status(400).json({ error: 'Need at least 3 chapters to publish' });
  }

  const { data: existing } = await supabase
    .from('library_stories')
    .select('id')
    .eq('user_token', token)
    .eq('branch_id', branchId)
    .single();

  if (existing) {
    return res.status(400).json({ error: 'This story is already published' });
  }

  const { data: story } = await supabase
    .from('library_stories')
    .insert({
      user_token: token,
      branch_id: branchId || null,
      title: title || chapters[0].title || 'Untitled Adventure',
      description: description || chapters[0].narrative.substring(0, 200) + '...',
      cover_image: chapters[0].image_url,
      genre: genre,
      chapter_count: chapters.length,
      is_published: true
    })
    .select()
    .single();

  res.json({
    story_id: story.id,
    share_url: `${process.env.FRONTEND_URL}/library/${story.id}`,
    message: '📖 Story published to the library!'
  });
});

// Get library stories
router.get('/stories', async (req, res) => {
  const { genre, sort = 'upvotes', limit = 20, offset = 0 } = req.query;

  let query = supabase
    .from('library_stories')
    .select(`
      *,
      users!inner (token, has_paid)
    `)
    .eq('is_published', true);

  if (genre && genre !== 'All') {
    query = query.eq('genre', genre);
  }

  if (sort === 'upvotes') {
    query = query.order('upvotes', { ascending: false });
  } else if (sort === 'views') {
    query = query.order('views', { ascending: false });
  } else if (sort === 'newest') {
    query = query.order('published_at', { ascending: false });
  }

  const { data: stories } = await query
    .range(offset, offset + limit - 1);

  const { count } = await supabase
    .from('library_stories')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true);

  res.json({
    stories: stories || [],
    total: count || 0,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
});

// Get single story
router.get('/story/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.headers['x-user-token'];

  const { data: story } = await supabase
    .from('library_stories')
    .select(`
      *,
      users!inner (token, has_paid)
    `)
    .eq('id', id)
    .eq('is_published', true)
    .single();

  if (!story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  await supabase
    .from('library_stories')
    .update({ views: (story.views || 0) + 1 })
    .eq('id', id);

  let chapters = [];
  if (story.branch_id) {
    const { data: chaps } = await supabase
      .from('chapters')
      .select('*')
      .eq('branch_id', story.branch_id)
      .order('chapter_number', { ascending: true });
    chapters = chaps || [];
  }

  let hasUpvoted = false;
  if (token) {
    const { data: upvote } = await supabase
      .from('library_upvotes')
      .select('*')
      .eq('story_id', id)
      .eq('user_token', token)
      .single();
    hasUpvoted = !!upvote;
  }

  const { data: comments } = await supabase
    .from('library_comments')
    .select('*')
    .eq('story_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  res.json({
    story: {
      ...story,
      hasUpvoted,
      chapters,
      comments: comments || []
    }
  });
});

// Upvote a story
router.post('/upvote', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { storyId } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Login required to upvote' });
  }

  const { data: existing } = await supabase
    .from('library_upvotes')
    .select('*')
    .eq('story_id', storyId)
    .eq('user_token', token)
    .single();

  if (existing) {
    await supabase
      .from('library_upvotes')
      .delete()
      .eq('story_id', storyId)
      .eq('user_token', token);
    
    const { data: story } = await supabase
      .from('library_stories')
      .select('upvotes')
      .eq('id', storyId)
      .single();
    
    await supabase
      .from('library_stories')
      .update({ upvotes: Math.max(0, (story.upvotes || 0) - 1) })
      .eq('id', storyId);

    return res.json({ upvoted: false, action: 'removed' });
  }

  await supabase
    .from('library_upvotes')
    .insert({ story_id: storyId, user_token: token });

  const { data: story } = await supabase
    .from('library_stories')
    .select('upvotes')
    .eq('id', storyId)
    .single();

  await supabase
    .from('library_stories')
    .update({ upvotes: (story.upvotes || 0) + 1 })
    .eq('id', storyId);

  res.json({ upvoted: true, action: 'added' });
});

// Add comment
router.post('/comment', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { storyId, comment } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'Login required to comment' });
  }

  if (!comment || comment.length < 3) {
    return res.status(400).json({ error: 'Comment must be at least 3 characters' });
  }

  const { data: newComment } = await supabase
    .from('library_comments')
    .insert({
      story_id: storyId,
      user_token: token,
      comment: comment
    })
    .select()
    .single();

  res.json(newComment);
});

// Get genres
router.get('/genres', async (req, res) => {
  const { data: genres } = await supabase
    .from('library_stories')
    .select('genre')
    .eq('is_published', true)
    .not('genre', 'is', null);

  const uniqueGenres = [...new Set(genres.map(g => g.genre))];
  res.json(['All', ...uniqueGenres]);
});

export default router;