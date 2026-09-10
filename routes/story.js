import express from 'express';
import OpenAI from 'openai';
import Replicate from 'replicate';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helper: Get or create user
async function getOrCreateUser(token) {
  if (!token) return null;
  
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('token', token)
    .single();
  
  if (user) return user;
  
  // Create user if doesn't exist
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

  console.log('Generate called. Token:', token, 'Scenario:', scenario);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const user = await getOrCreateUser(token);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.chapters_used >= 3 && !user.has_paid) {
    return res.status(402).json({
      error: 'PAYMENT_REQUIRED',
      message: "You've used your 3 free chapters."
    });
  }

  try {
    const storyPrompt = `You are a fantasy adventure writer. Generate Chapter ${chapterNumber} of an interactive story.

Scenario: ${scenario}

Output JSON format:
{
  "title": "Chapter title",
  "narrative": "The story text (3-5 paragraphs)",
  "choices": [
    { "label": "Choice A", "description": "What happens next" },
    { "label": "Choice B", "description": "What happens next" },
    { "label": "Choice C", "description": "What happens next" }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: storyPrompt }],
      temperature: 0.85,
      response_format: { type: "json_object" }
    });

    const storyData = JSON.parse(completion.choices[0].message.content);

    // Save chapter
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

    // Increment chapters used
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

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

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

Generate Chapter ${nextChapter} in JSON format:
{
  "title": "Chapter title",
  "narrative": "The story continues... (3-5 paragraphs)",
  "choices": [
    { "label": "Choice A", "description": "..." },
    { "label": "Choice B", "description": "..." },
    { "label": "Choice C", "description": "..." }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: continuationPrompt }],
      temperature: 0.85,
      response_format: { type: "json_object" }
    });

    const storyData = JSON.parse(completion.choices[0].message.content);

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
  if (!choice) return res.status(400).json({ error: 'Invalid choice' });

  const dicePrompt = `You are a fantasy game master. Player chose: "${choice.label}".
They rolled ${diceType} and got: ${rollValue}.
Generate a dramatic outcome.

Respond in JSON:
{ "outcome": "The dramatic result..." }`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: dicePrompt }],
    temperature: 0.8,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(completion.choices[0].message.content);

  res.json({
    roll_value: rollValue,
    dice_type: diceType,
    outcome: result.outcome,
    choice_made: choice.label
  });
});

export default router;
