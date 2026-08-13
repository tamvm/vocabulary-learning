import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createSupabaseClient } from './config/supabase.js';
import wordsRoutes from './routes/words.js';
import userRoutes from './routes/users.js';
import aiRoutes from './routes/ai.js';
import profileRoutes from './routes/profile.js';
import flashcardRoutes from './routes/flashcards.js';
import groupsRoutes from './routes/groups.js';
import youtubeRoutes from './routes/youtube.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3012;

// Trust proxy when deployed behind a reverse proxy (Railway, Heroku, etc.)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
  // SPA is on voca.kenchange.com; API is on api.voca.kenchange.com
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:5173'], // Vite dev ports
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Supabase client
const supabase = createSupabaseClient();

// Make Supabase available to all routes
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Public routes
app.use('/api/users', userRoutes);

// Protected routes (require authentication)
app.use('/api/words', authMiddleware, wordsRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);
app.use('/api/profile', authMiddleware, profileRoutes);
app.use('/api/flashcards', authMiddleware, flashcardRoutes);
app.use('/api/groups', authMiddleware, groupsRoutes);
app.use('/api/youtube', authMiddleware, youtubeRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Magic English Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Supabase URL: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`📁 File upload support: enabled (5MB limit)`);
});

export default app;