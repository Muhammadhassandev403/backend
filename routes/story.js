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
      'Authorization': `Bearer ${apiKey}`,
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

// Helper: Get or create user
async function getOrCreateUser(token) {
  if (!token) return null;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('token', token)
    .single();

  if (user) return user;

  const { data: newUser } = await supabase
    .from('users')
    .insert({
      token: token,
      chapters_used: 0,
      has_paid: false,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  return newUser;
}

// Generate Chapter 1
router.post('/generate', async (req, res) => {
  const { scenario, chapterNumber = 1, userToken } = req.body;
  const token = userToken || req.headers['x-user-token'];

  if (!token) return res.status(401).json({ error: 'No token provided' });

  const user = await getOrCreateUser(token);
  if (!user) return res.status(401).json({ error: 'User not found' });

  if (user.chapters_used >= 3 && !user.has_paid) {
    return res.status(402).json({
      error: 'PAYMENT_REQUIRED',
      message: "You've used your 3 free chapters."
    });
  }

  try {
    const storyPrompt = `You are a fantasy adventure writer. Generate Chapter ${chapterNumber} of an interactive story.

Scenario: ${scenario}

Respond ONLY with valid JSON:
{
  "title": "Chapter title",
  "narrative": "The story text (3-5 paragraphs)",
  "choices": [
    { "label": "Choice A", "description": "What happens next" },
    { "label": "Choice B", "description": "What happens next" },
    { "label": "Choice C", "description": "What happens next" }
  ]
}`;

    const rawText = await generateWithGroq(storyPrompt);
    const storyData = JSON.parse(rawText);

    const { data: saved } = await supabase
      .from('chapters')
      .insert({
        user_token: token,
        chapter_number: chapterNumber,
        title: storyData.title,
        narrative: storyData.narrative,
        choices: storyData.choices,
        image_url: null,
        is_free: chapterNumber <= 3
      })
      .select()
      .single();

    if (chapterNumber <= 3) {
      await supabase
        .from('users')
        .update({ chapters_used: (user.chapters_used || 0) + 1 })
        .eq('token', token);
    }

    res.json({
      chapter: saved,
      image_url: null,
      is_free: chapterNumber <= 3,
      chapters_remaining: user.has_paid ? Infinity : Math.max(0, 3 - (user.chapters_used + 1))
    });

  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Continue story
router.post('/continue', async (req, res) => {
  const { choiceIndex, previousChapterId, userToken } = req.body;
  const token = userToken || req.headers['x-user-token'];

  const user = await getOrCreateUser(token);
  if (!user) return res.status(401).json({ error: 'User not found' });

  if (user.chapters_used >= 3 && !user.has_paid) {
    return res.status(402).json({ error: 'PAYMENT_REQUIRED' });
  }

  const { data: prev } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', previousChapterId)
    .single();

  const nextChapter = prev.chapter_number + 1;

  try {
    const continuationPrompt = `You are a fantasy adventure writer. Continue the story.

Previous chapter: ${prev.narrative}
Player chose: ${prev.choices[choiceIndex].label} - ${prev.choices[choiceIndex].description}

Respond ONLY with valid JSON:
{
  "title": "Chapter title",
  "narrative": "The story continues...",
  "choices": [
    { "label": "Choice A", "description": "..." },
    { "label": "Choice B", "description": "..." },
    { "label": "Choice C", "description": "..." }
  ]
}`;

    const rawText = await generateWithGroq(continuationPrompt);
    const storyData = JSON.parse(rawText);

    const { data: saved } = await supabase
      .from('chapters')
      .insert({
        user_token: token,
        chapter_number: nextChapter,
        title: storyData.title,
        narrative: storyData.narrative,
        choices: storyData.choices,
        image_url: null,
        is_free: nextChapter <= 3
      })
      .select()
      .single();

    res.json({
      chapter: saved,
      is_free: nextChapter <= 3,
      chapters_remaining: user.has_paid ? Infinity : Math.max(0, 3 - (user.chapters_used + 1))
    });

  } catch (err) {
    console.error('Continue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dice roll
router.post('/roll', async (req, res) => {
  const { chapterId, choiceIndex, diceType = 'd20', rollValue } = req.body;

  const { data: chapter } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();

  if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

  const choice = chapter.choices[choiceIndex];

  try {
    const dicePrompt = `You are a fantasy game master. Player chose: "${choice.label}".
They rolled ${diceType} and got: ${rollValue}.
Respond ONLY with JSON: { "outcome": "The dramatic result..." }`;

    const rawText = await generateWithGroq(dicePrompt);
    const result = JSON.parse(rawText);

    res.json({
      roll_value: rollValue,
      dice_type: diceType,
      outcome: result.outcome,
      choice_made: choice.label
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
