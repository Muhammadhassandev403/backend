import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import storyRoutes from './routes/story.js';
import paymentRoutes from './routes/payment.js';
import userRoutes from './routes/user.js';
import editRoutes from './routes/edit.js';
import shareRoutes from './routes/share.js';
import exportRoutes from './routes/export.js';
import libraryRoutes from './routes/library.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/story', storyRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/edit', editRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/library', libraryRoutes);

app.listen(PORT, () => {
  console.log(`⚔️ Spellcast running on http://localhost:${PORT}`);
});