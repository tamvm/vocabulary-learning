# Magic English Scripts

This directory contains utility scripts for managing the Magic English application.

## Learn vocab probe

Trace why `/learn` returns no words for a YouTube URL. Default video is the Dalio / AI-bubble short.

```bash
node scripts/learn-vocab-probe.js --local --cefr B2 --url 'https://www.youtube.com/watch?v=WZ7mmTrSgxI'
node scripts/learn-vocab-probe.js --direct --url 'https://www.youtube.com/watch?v=WZ7mmTrSgxI'
```

`--local` ranks a caption fixture (no YouTube / AI). `--direct` uses Transcript24 then the same ranker (`TRANSCRIPT24_API_KEY` in `backend/.env` or `~/.openclaw/openclaw.json` on the Hetzner host). On GitHub: Actions → **Learn vocab probe** → Run workflow (self-hosted runner on openclaw).

## Supabase keep-alive

Ping free-tier Supabase so the project does not auto-pause. See [docs/supabase-keepalive.md](../docs/supabase-keepalive.md).

```bash
npm run supabase:keepalive
```

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) in `backend/.env`.

## Reset Today's Learning

Reset all flashcards that were studied today back to their previous state, effectively undoing today's learning progress.

### Quick Usage

```bash
# Preview what would be reset (recommended first)
npm run reset-today:dry-run

# Actually reset today's learning
npm run reset-today
```

### Advanced Usage

```bash
# Run directly with Node.js
node scripts/reset-today-learning.js --dry-run

# Run with bash wrapper
./scripts/reset-today.sh --dry-run

# Reset for a specific user only
node scripts/reset-today-learning.js --user-id=123 --dry-run

# Get help
node scripts/reset-today-learning.js --help
```

### Options

- `--dry-run` - Preview what would be reset without making changes
- `--user-id=<id>` - Reset learning for a specific user only
- `--help` - Show detailed help information

### What the Script Does

1. **Finds Today's Cards**: Identifies all flashcards that were reviewed today
2. **Shows Preview**: Lists the cards that would be affected
3. **Resets Card State**: For each card:
   - If it was a new card today → Reset to "new" state
   - If it was reviewed before → Restore to previous state (before today's review)
4. **Cleans History**: Removes today's review history entries
5. **Shows Summary**: Reports success/failure counts

### Safety Features

- ⚠️ **Confirmation Required**: Script asks for confirmation before proceeding
- 🔍 **Dry Run Mode**: Always test with `--dry-run` first
- 📋 **Detailed Logging**: Shows exactly what will be changed
- 🛡️ **Error Handling**: Continues processing even if some cards fail

### Example Output

```
🔄 Magic English - Reset Today's Learning

🔍 Looking for cards studied today (2025-01-15)
📚 Found 5 cards studied today:

1. "serendipity" - The occurrence of events by chance in a beneficial way...
   Current: review, reps: 3, interval: 7 days

2. "ephemeral" - Lasting for a very short time...
   Current: learning, reps: 1, interval: 1 days

🔄 Proceeding with reset...

Resetting: "serendipity"
  ✅ Restored to previous state (review)

Resetting: "ephemeral"
  ✅ Reset to new card state

📊 Reset Summary:
✅ Successfully reset: 5 cards
🎉 Reset complete! Your learning progress for today has been undone.
```

### Prerequisites

- Node.js installed
- Supabase environment variables configured in `.env`:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### When to Use

- **Accidentally studied too much**: Reset to pace your learning
- **Want to re-study**: Practice the same cards again
- **Made mistakes**: Undo incorrect ratings/reviews
- **Testing**: Reset test data during development

### ⚠️ Important Notes

- **Irreversible**: This action cannot be undone
- **Today only**: Only affects cards studied today
- **All users**: Affects all users unless `--user-id` is specified
- **Database changes**: Directly modifies the database

Always run with `--dry-run` first to preview changes!