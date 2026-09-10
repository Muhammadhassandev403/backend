import express from 'express';
import OpenAI from 'openai';
import Replicate from 'replicate';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Generate Chapter 1 (FREE)
router.post('/generate', async (req, res) => {
  const { scenario, chapterNumber = 1, userToken } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('chapters_used, has_paid')
    .eq('token', userToken)
    .single();

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.chapters_used >= 3 && !user.has_paid) {
    return res.status(402).json({ 
      error: 'PAYMENT_REQUIRED',
      message: 'You\'ve used your 3 free chapters. Pay N2,000 to continue.'
    });
  }

  const storyPrompt = `
    You are a fantasy adventure writer. Generate Chapter ${chapterNumber} of an interactive story.
    
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
    }
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: storyPrompt }],
    temperature: 0.85,
    response_format: { type: "json_object" }
  });

  const storyData = JSON.parse(completion.choices[0].message.content);

  // Generate image
  let imageUrl = null;
  try {
    const imagePrompt = `Fantasy scene: ${scenario}, ${storyData.title}, cinematic, D&D style, high quality`;
    const image = await replicate.run(
      "stability-ai/stable-diffusion:db21e45d3f7023abc2ae46a38a03973f4d4b0f2b7b2e9f8d3a8c5f4e6b7c8d9e",
      {
        input: {
          prompt: imagePrompt,
          width: 768,
          height: 512,
          num_outputs: 2
          guidance_scale: 7.5,
        }
      }
    );
    imageUrl = image[0];
  } catch (e) {
    console.log('Image generation skipped');
  }

  const { data: saved } = await supabase
    .from('chapters')
    .insert({
      user_token: userToken,
      chapter_number: chapterNumber,
      title: storyData.title,
      narrative: storyData.narrative,
      choices: storyData.choices,
      image_url: imageUrl,
      is_free: chapterNumber <= 3
    })
    .select()
    .single();

  if (chapterNumber <= 3) {
    await supabase
      .from('users')
      .update({ chapters_used: user.chapters_used + 1 })
      .eq('token', userToken);
  }

  res.json({
    chapter: saved,
    image_url: imageUrl,
    is_free: chapterNumber <= 3,
    chapters_remaining: user.has_paid ? Infinity : Math.max(0, 3 - (user.chapters_used + 1))
  });
});

// Continue from choice
router.post('/continue', async (req, res) => {
  const { choiceIndex, previousChapterId, userToken } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('has_paid, chapters_used')
    .eq('token', userToken)
    .single();

  if (user.chapters_used >= 3 && !user.has_paid) {
    return res.status(402).json({ error: 'PAYMENT_REQUIRED' });
  }

  const { data: prev } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', previousChapterId)
    .single();

  const nextChapter = prev.chapter_number + 1;
  
  const continuationPrompt = `
    You are a fantasy adventure writer. Continue the story.
    
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
    }
  `;

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
      user_token: userToken,
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
});

// Dice Roll
router.post('/roll', async (req, res) => {
  const { chapterId, choiceIndex, diceType = 'd20', rollValue } = req.body;
  const token = req.headers['x-user-token'];

  const { data: chapter } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();

  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  const choice = chapter.choices[choiceIndex];
  if (!choice) {
    return res.status(400).json({ error: 'Invalid choice' });
  }

  const dicePrompt = `
    You are a fantasy game master. The player chose: "${choice.label} - ${choice.description}"
    They rolled a ${diceType} and got: ${rollValue} (out of ${diceType === 'd20' ? 20 : diceType === 'd12' ? 12 : 6})
    
    Generate a dramatic outcome based on this roll:
    - If roll is high (70%+ of max): Success! Describe an epic outcome.
    - If roll is medium (30-70%): Mixed results.
    - If roll is low (below 30%): Failure or complication.
    
    Respond in JSON:
    {
      "outcome": "The dramatic result of their action...",
      "modified": true
    }
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: dicePrompt }],
    temperature: 0.8,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(completion.choices[0].message.content);

  await supabase
    .from('chapters')
    .update({
      dice_outcome: result.outcome,
      dice_roll: rollValue,
      dice_type: diceType
    })
    .eq('id', chapterId);

  res.json({
    roll_value: rollValue,
    dice_type: diceType,
    outcome: result.outcome,
    choice_made: choice.label
  });
});

export default router;