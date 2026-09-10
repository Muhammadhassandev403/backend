import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Export as PDF
router.get('/pdf/:branchId?', async (req, res) => {
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

  if (!chapters || chapters.length === 0) {
    return res.status(404).json({ error: 'No chapters found' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('scenario')
    .eq('token', token)
    .single();

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 70, bottom: 70, left: 70, right: 70 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=spellcast-story-${Date.now()}.pdf`);

  doc.pipe(res);

  // Cover
  doc.fontSize(28).fillColor('#f0c060').text('⚔️ Spellcast', { align: 'center' });
  doc.moveDown();
  doc.fontSize(20).fillColor('#e0d6c8').text(user?.scenario || 'An Epic Adventure', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).fillColor('#888').text(`Written by: ${user?.token?.substring(0, 8) || 'Anonymous'}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('#666').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.moveDown();
  doc.text(`Chapters: ${chapters.length}`, { align: 'center' });
  doc.addPage();

  // Chapters
  chapters.forEach((chapter) => {
    doc.fontSize(22).fillColor('#f0c060').text(`Chapter ${chapter.chapter_number}: ${chapter.title}`);
    doc.moveDown(0.5);
    doc.fontSize(13).fillColor('#e0d6c8').text(chapter.narrative, { lineGap: 4 });
    doc.moveDown(0.5);

    if (chapter.choices && chapter.choices.length > 0) {
      doc.fontSize(11).fillColor('#888').text('⚔️ Your Choices:', { underline: true });
      doc.moveDown(0.3);
      chapter.choices.forEach((choice, idx) => {
        doc.fontSize(11).fillColor('#aaa').text(`  ${idx + 1}. ${choice.label}: ${choice.description}`, { lineGap: 2 });
      });
    }

    doc.moveDown(1);
    doc.addPage();
  });

  doc.fontSize(16).fillColor('#f0c060').text('🏰 The End', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('#666').text('Created with Spellcast — Interactive Fantasy', { align: 'center' });

  doc.end();
});

// Export as EPUB (ZIP)
router.get('/epub/:branchId?', async (req, res) => {
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

  if (!chapters || chapters.length === 0) {
    return res.status(404).json({ error: 'No chapters found' });
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=spellcast-ebook-${Date.now()}.zip`);
  archive.pipe(res);

  for (const chapter of chapters) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Chapter ${chapter.chapter_number}</title>
        <style>
          body { font-family: Georgia, serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #faf6f0; color: #1a1512; line-height: 1.8; }
          h1 { color: #7a4a2a; border-bottom: 2px solid #7a4a2a; padding-bottom: 10px; }
          .choices { background: #f0ebe5; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .choice { padding: 5px 0; }
          .chapter-num { color: #888; font-size: 14px; }
          img { max-width: 100%; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="chapter-num">Chapter ${chapter.chapter_number}</div>
        <h1>${chapter.title}</h1>
        ${chapter.image_url ? `<img src="${chapter.image_url}" alt="Scene">` : ''}
        <div>${chapter.narrative.replace(/\n/g, '<br>')}</div>
        <div class="choices">
          <strong>⚔️ Choices:</strong>
          ${chapter.choices.map(c => `<div class="choice">• ${c.label}: ${c.description}</div>`).join('')}
        </div>
      </body>
      </html>
    `;
    archive.append(html, { name: `chapter-${chapter.chapter_number}.html` });
  }

  const coverHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Cover</title>
    <style>body { font-family: Georgia; text-align: center; padding: 100px 20px; background: #1a1512; color: #f0c060; } h1 { font-size: 48px; } .sub { color: #888; font-size: 18px; }</style>
    </head>
    <body>
      <h1>⚔️ Spellcast</h1>
      <div class="sub">An Epic Adventure</div>
      <div style="color:#666; margin-top:40px;">${new Date().toLocaleDateString()}</div>
    </body>
    </html>
  `;
  archive.append(coverHtml, { name: 'cover.html' });

  archive.finalize();
});

export default router;