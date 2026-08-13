# Magic English Web App

A modern web application version of Magic English - an AI-powered vocabulary learning platform built with Node.js, React, and Supabase.

## ✨ Features

- **AI-Powered Word Analysis**: Automatically analyze words with detailed definitions, IPA pronunciation, CEFR levels, and examples
- **Sentence Scoring**: Get detailed grammar, vocabulary, and style analysis for your English sentences
- **Vocabulary Management**: Organize and search your vocabulary with advanced filtering
- **Progress Tracking**: Monitor your learning progress with streaks, goals, and achievements
- **Modern UI**: Clean, responsive interface with dark mode support
- **Real-time Sync**: Cloud-based storage with Supabase for access across devices

## 🏗️ Architecture

### Backend (Node.js + Express)
- RESTful API with Express.js
- Supabase integration for database and authentication
- AI service integration (Ollama Cloud, OpenAI, or local Ollama)
- Comprehensive error handling and validation

### Frontend (React + Vite)
- Modern React application with hooks and context
- Tailwind CSS for styling
- React Router for navigation
- Axios for API communication
- Real-time updates and optimistic UI

### Database (Supabase)
- PostgreSQL with Row Level Security
- Real-time subscriptions
- User authentication and profile management
- Structured vocabulary and progress data

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- AI provider API key (Ollama Cloud recommended)

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd magic_english

# Install dependencies for all packages
npm run install:deps
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings > API and copy your project URL and anon key
3. In the SQL editor, run the scripts in this order:
   - `backend/sql/migrations.sql`
   - `backend/sql/functions.sql`

### 3. Configure Environment Variables

#### Backend (.env)
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

# Supabase
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key

# AI Provider (choose one)
AI_PROVIDER=ollama-cloud
AI_API_KEY=your-ollama-cloud-api-key
AI_MODEL=gpt-oss:20b-cloud
```

#### Frontend (.env)
```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Start Development

```bash
# Start both backend and frontend
npm run dev
```

This will start:
- Backend API server at http://localhost:5000
- Frontend development server at http://localhost:3000

## 📖 Detailed Setup

### Supabase Setup

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New project"
   - Choose organization and set project details

2. **Get API Keys**
   - Go to Settings > API
   - Copy "Project URL" and "anon/public" key

3. **Set up Database Schema**
   - Go to the SQL Editor
   - Copy and run `backend/sql/migrations.sql`
   - Then run `backend/sql/functions.sql`

4. **Configure Authentication**
   - Go to Authentication > Settings
   - Enable email authentication
   - Configure email templates if needed

### AI Provider Setup

#### Option 1: Ollama Cloud (Recommended)
1. Sign up at [ollama.com](https://ollama.com)
2. Get your API key from the dashboard
3. Use model `gpt-oss:20b-cloud` for best results

#### Option 2: OpenAI
1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Set `AI_PROVIDER=openai` and `AI_MODEL=gpt-4o-mini`

#### Option 3: Local Ollama
1. Install Ollama locally
2. Run `ollama serve`
3. Set `AI_PROVIDER=ollama-local` and `AI_MODEL=llama3.2:latest`

### Production Deployment

**Preferred:** Coolify (Docker) — project `i8luqt7n49kugwqwfbcyrfvl` (`vocabulary-learning`).  
See **[Coolify Deployment Guide](docs/COOLIFY_DEPLOYMENT.md)** for GitHub App + Auto Deploy on `main`.

| Service | Dockerfile | Port |
|---------|------------|------|
| Backend | `backend/Dockerfile` | `3012` |
| Frontend | `frontend/Dockerfile` | `3102` |

#### Environment Variables for Production
Update these for production:
```env
# Backend
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com

# Frontend
VITE_API_URL=https://your-backend-domain.com/api
```

## 🛠️ Development

### Project Structure

```
magic_english/
├── README.md              # Main project overview
├── CLAUDE.md              # Claude Code configuration
├── docs/                  # 📚 Detailed documentation
│   ├── RAILWAY_DEPLOYMENT.md
│   ├── QUIZ_FSRS_IMPLEMENTATION.md
│   └── ...
├── backend/               # Node.js API server
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Express middleware
│   │   └── config/       # Configuration
│   └── sql/              # Database migrations
├── frontend/             # React application
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── contexts/     # React contexts
│   │   └── lib/          # Utilities and API
└── package.json         # Workspace configuration
```

### Available Scripts

```bash
# Development
npm run dev              # Start both backend and frontend
npm run dev:server       # Start only backend
npm run dev:client       # Start only frontend

# Building
npm run build           # Build both applications
npm run build:server    # Build backend (no-op for Node.js)
npm run build:client    # Build frontend for production

# Production
npm start              # Start production server (backend only)
```

### API Documentation

#### Authentication Endpoints
- `POST /api/users/signup` - Create new account
- `POST /api/users/signin` - Sign in
- `POST /api/users/signout` - Sign out
- `GET /api/users/me` - Get current user profile

#### Words Endpoints
- `GET /api/words` - Get user's vocabulary
- `POST /api/words` - Create new word
- `PUT /api/words/:id` - Update word
- `DELETE /api/words/:id` - Delete word
- `POST /api/words/bulk` - Bulk operations

#### AI Endpoints
- `POST /api/ai/analyze-word` - Analyze word with AI
- `POST /api/ai/analyze-sentence` - Analyze sentence
- `POST /api/ai/chat` - Chat with AI assistant

#### Profile Endpoints
- `GET /api/profile` - Get user profile and stats
- `POST /api/profile/activity` - Record learning activity
- `PUT /api/profile/goals` - Update learning goals

## 🔧 Configuration

### Database Schema
The application uses these main tables:
- `users` - User profiles
- `words` - Vocabulary entries
- `profiles` - Learning statistics and achievements
- `collections` - Word organization (future feature)

### AI Integration
Supports multiple AI providers:
- **Ollama Cloud** - Cloud-hosted models (recommended)
- **OpenAI** - GPT models
- **Local Ollama** - Self-hosted models

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify Supabase URL and API keys
   - Ensure database schema is properly set up
   - Check network connectivity

2. **AI API Errors**
   - Verify AI provider API key
   - Check API rate limits
   - Ensure model name is correct

3. **Build Errors**
   - Clear node_modules and reinstall dependencies
   - Check Node.js version compatibility
   - Verify environment variables

4. **CORS Issues**
   - Ensure backend CORS is configured correctly
   - Check frontend and backend URLs match

### Getting Help

- Check the [Issues](https://github.com/your-repo/issues) page
- Review error logs in browser console and server logs
- Verify all environment variables are set correctly

## 📚 Documentation

For detailed documentation on specific topics, see the [docs/](docs/) folder:

- **[Coolify Deployment](docs/COOLIFY_DEPLOYMENT.md)** - Production Coolify + auto-deploy
- **[Self-hosted CI](docs/ci-self-hosted-runner.md)** - GitHub Actions self-hosted runner
- **[GitHub Setup](docs/GITHUB_SETUP.md)** - Repository and CI/CD setup
- **[Migration Guide](docs/MIGRATION_GUIDE.md)** - Database migrations
- **[Quiz FSRS Implementation](docs/QUIZ_FSRS_IMPLEMENTATION.md)** - Advanced spaced repetition
- **[Contributing Guidelines](docs/CONTRIBUTING.md)** - Development guidelines
- **[Release Notes](docs/RELEASE.md)** - Version history and features

## 📄 License

This project is licensed under the MIT License - see the original LICENSE.txt file for details.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](docs/CONTRIBUTING.md) for detailed information.

Quick steps:
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 🔮 Roadmap

- [ ] Enhanced profile and statistics dashboard
- [ ] Advanced vocabulary collections and tags
- [ ] Spaced repetition learning system
- [ ] Mobile app (React Native)
- [ ] Collaborative learning features
- [ ] Advanced AI features and integrations