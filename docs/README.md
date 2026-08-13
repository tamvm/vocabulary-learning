# Magic English Documentation

This folder contains all the detailed documentation for the Magic English application.

## 📚 Documentation Index

### 🚀 Deployment & Setup
- **[Coolify Deployment Guide](COOLIFY_DEPLOYMENT.md)** - Production https://voca.kenchange.com (Coolify project `i8luqt7n49kugwqwfbcyrfvl`) + deploy-on-merge via Actions
- **[Self-hosted CI runner](ci-self-hosted-runner.md)** - GitHub Actions self-hosted runner for CI
- **[Supabase keep-alive](supabase-keepalive.md)** - Cron ping so free-tier Supabase does not auto-pause
- **[Railway Deployment Guide](RAILWAY_DEPLOYMENT.md)** - Legacy Railway notes (Coolify is preferred)
- **[GitHub Setup Guide](GITHUB_SETUP.md)** - Setting up GitHub repository and workflows
- **[Migration Guide](MIGRATION_GUIDE.md)** - Database migrations and version updates

### 🔧 Development
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute to the project
- **[Release Process](RELEASE.md)** - Release notes and version management

### 🧠 Features & Algorithms
- **[Quiz FSRS Implementation](QUIZ_FSRS_IMPLEMENTATION.md)** - Exponential spaced repetition for quiz questions

## 📁 Project Structure

```
magic_english/
├── README.md              # Main project overview
├── .cursorrules           # Cursor agent project rules
├── .cursor/               # Cursor rules + skills (PR workflow, discipline)
├── docs/                  # 📚 All documentation (this folder)
│   ├── README.md          # This file - documentation index
│   ├── COOLIFY_DEPLOYMENT.md
│   ├── ci-self-hosted-runner.md
│   ├── RAILWAY_DEPLOYMENT.md
│   ├── GITHUB_SETUP.md
│   ├── MIGRATION_GUIDE.md
│   ├── CONTRIBUTING.md
│   ├── RELEASE.md
│   └── QUIZ_FSRS_IMPLEMENTATION.md
├── frontend/              # React frontend application
├── backend/               # Node.js backend API
└── scripts/               # Utility scripts
```

## 🔗 Quick Links

### For Developers
- Start with [Contributing Guidelines](CONTRIBUTING.md)
- Check the [main README](../README.md) for setup instructions
- Follow [.cursorrules](../.cursorrules) for AI / Cursor agent configuration

### For Deployment
- Use [Coolify Deployment Guide](COOLIFY_DEPLOYMENT.md) for production hosting + auto-deploy
- Use [Self-hosted CI runner](ci-self-hosted-runner.md) for Actions
- [Railway Deployment Guide](RAILWAY_DEPLOYMENT.md) is legacy
- Follow [GitHub Setup](GITHUB_SETUP.md) for repository management
- Apply [Migration Guide](MIGRATION_GUIDE.md) for database updates

### For Feature Documentation
- Learn about [Quiz FSRS Algorithm](QUIZ_FSRS_IMPLEMENTATION.md)
- Check [Release Notes](RELEASE.md) for latest features

---

**Need help?** Check the main [README.md](../README.md) or create an issue in the GitHub repository.