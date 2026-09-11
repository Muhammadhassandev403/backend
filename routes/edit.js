import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helper: Call Groq API
async function generateWithGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('Groq API error: ' + JSON.stringify(data));
  }
  return data.choices[0].message.content;
}

// Get full story history
router.get('/history/:branchId?', async (req, res) => {
  const token = req.headers['x-user-token'];
  const branchId = req.params.branchId || null;

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

  const { data: branches } = await supabase
    .from('story_branches')
    .select('*')
    .eq('user_token', token)
    .order('created_at', { ascending: false });

  res.json({
    chapters: chapters || [],
    branches: branches || [],
    current_branch: branchId || branches?.[0]?.id || null
  });
});

// Edit a chapter and regenerate future
router.post('/edit-chapter', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { chapterId, newTitle, newNarrative, newChoices, regenerateFuture = true } = req.body;

  const { data: original } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .eq('user_token', token)
    .single();

  if (!original) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  const { data: branch } = await supabase
    .from('story_branches')
    .insert({
      user_token: token,
      branch_name: 'Edit at Chapter ' + original.chapter_number + ' - ' + new Date().toLocaleString(),
      is_active: true
    })
    .select()
    .single();

  await supabase
    .from('story_branches')
    .update({ is_active: false })
    .eq('user_token', token)
    .eq('is_active', true);

  const { data: previousChapters } = await supabase
    .from('chapters')
    .select('*')
    .eq('user_token', token)
    .eq('branch_id', original.branch_id)
    .lte('chapter_number', original.chapter_number)
    .order('chapter_number', { ascending: true });

  for (const ch of previousChapters) {
    const isEdited = ch.id === chapterId;
    await supabase
      .from('chapters')
      .insert({
        user_token: token,
        branch_id: branch.id,
        chapter_number: ch.chapter_number,
        title: isEdited ? newTitle : ch.title,
        narrative: isEdited ? newNarrative : ch.narrative,
        choices: isEdited ? newChoices : ch.choices,
        image_url: ch.image_url,
        is_free: ch.is_free,
        is_edited: isEdited,
        original_version_id: isEdited ? ch.id : null
      });
  }

  let regeneratedChapters = [];
  if (regenerateFuture) {
    const editedChapter = previousChapters.find(c => c.id === chapterId);
    const newChoicesParsed = newChoices || editedChapter.choices;

    let currentChapterNumber = original.chapter_number;
    let currentNarrative = newNarrative;
    let currentChoices = newChoicesParsed;

    for (let i = 0; i < 5; i++) {
      const nextNum = currentChapterNumber + i + 1;

      const continuationPrompt = 'You are a fantasy adventure writer. Continue the story.\n\nPrevious chapter: ' + currentNarrative + '\nPlayer chose: ' + (currentChoices?.[0]?.label || 'continue') + ' - ' + (currentChoices?.[0]?.description || 'continue') + '\n\nRespond ONLY with valid JSON:\n{\n  "title": "Chapter title",\n  "narrative": "The story continues...",\n  "choices": [\n    { "label": "Choice A", "description": "..." },\n    { "label": "Choice B", "description": "..." },\n    { "label": "Choice C", "description": "..." }\n  ]\n}';

      const rawText = await generateWithGroq(continuationPrompt);
      const storyData = JSON.parse(rawText);

      const { data: newChapter } = await supabase
        .from('chapters')
        .insert({
          user_token: token,
          branch_id: branch.id,
          chapter_number: nextNum,
          title: storyData.title,
          narrative: storyData.narrative,
          choices: storyData.choices,
          image_url: null,
          is_free: nextNum <= 3,
          is_edited: false
        })
        .select()
        .single();

      regeneratedChapters.push(newChapter);
      currentNarrative = storyData.narrative;
      currentChoices = storyData.choices;

      if (!regenerateFuture) break;
    }
  }

  const lastChapter = regeneratedChapters[regeneratedChapters.length - 1];
  if (lastChapter) {
    await supabase
      .from('users')
      .update({ last_chapter_id: lastChapter.id })
      .eq('token', token);
  }

  res.json({
    branch_id: branch.id,
    edited_chapter: { ...original, title: newTitle, narrative: newNarrative, choices: newChoices },
    regenerated_chapters: regeneratedChapters,
    message: 'Chapter edited! ' + regeneratedChapters.length + ' future chapters regenerated.'
  });
});

// Switch branches
router.post('/switch-branch', async (req, res) => {
  const token = req.headers['x-user-token'];
  const { branchId } = req.body;

  await supabase
    .from('story_branches')
    .update({ is_active: false })
    .eq('user_token', token);

  await supabase
    .from('story_branches')
    .update({ is_active: true })
    .eq('id', branchId)
    .eq('user_token', token);

  const { data: lastChapter } = await supabase
    .from('chapters')
    .select('id')
    .eq('branch_id', branchId)
    .order('chapter_number', { ascending: false })
    .limit(1)
    .single();

  if (lastChapter) {
    await supabase
      .from('users')
      .update({ last_chapter_id: lastChapter.id })
      .eq('token', token);
  }

  res.json({ success: true, branch_id: branchId, last_chapter_id: lastChapter?.id || null });
});

export default router;
