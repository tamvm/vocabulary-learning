/**
 * yt-dlp stderr is noisy (version warnings, 429). Probe/UI should get one line.
 * Run: node test_ytdlp_error.js
 */
import { summarizeYtDlpFailure } from './src/services/youtubeTranscriptService.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const dump = `WARNING: Your yt-dlp version (2026.02.21) is older than 90 days!
WARNING: [youtube] Unable to download webpage: HTTP Error 429: Too Many Requests
ERROR: [youtube] XuoqKYxDHVc: Sign in to confirm you’re not a bot. Use --cookies-from-browser`;

const bot = summarizeYtDlpFailure(dump);
assert(/Transcript24/.test(bot), 'bot-check points at Transcript24');
assert(!/older than 90 days/.test(bot), 'drops version warning');

const rate = summarizeYtDlpFailure('WARNING: HTTP Error 429: Too Many Requests');
assert(/429/.test(rate), 'mentions 429');

assert(
  summarizeYtDlpFailure('ERROR: [youtube] abc: no subtitles')
    .includes('no subtitles'),
  'keeps last ERROR line'
);

console.log('test_ytdlp_error: OK');
