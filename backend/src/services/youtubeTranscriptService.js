import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { transcript24Service } from './transcript24Service.js';
import { withTimeout } from './youtubeAnalyzeHelpers.js';

/** Collapse yt-dlp stderr (version warnings, 429, bot-check) into one user-facing line. */
export function summarizeYtDlpFailure(stderr = '') {
  const text = String(stderr);
  if (/HTTP Error 429/i.test(text) || /Too Many Requests/i.test(text)) {
    return 'YouTube rate-limited yt-dlp (HTTP 429). /learn uses Transcript24 — set TRANSCRIPT24_API_KEY instead of relying on yt-dlp.';
  }
  if (/Sign in to confirm/i.test(text) || /not a bot/i.test(text)) {
    return 'YouTube blocked yt-dlp (bot check). /learn uses Transcript24 — set TRANSCRIPT24_API_KEY or probe the live API with --remote.';
  }
  const lastError = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^ERROR:/i.test(line))
    .pop();
  if (lastError) return lastError.replace(/^ERROR:\s*/i, '').trim();
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact ? compact.slice(0, 280) : 'yt-dlp failed';
}

class YouTubeTranscriptService {
  constructor() {
    this.outputDir = path.join(os.tmpdir(), 'magic-english-transcripts');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  isYouTubeUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'www.youtube.com' ||
             urlObj.hostname === 'youtube.com' ||
             urlObj.hostname === 'youtu.be' ||
             urlObj.hostname === 'm.youtube.com';
    } catch {
      return false;
    }
  }

  async checkYouTubeDL() {
    return new Promise((resolve) => {
      const check = spawn('python3', ['-m', 'yt_dlp', '--version']);

      check.on('close', (code) => {
        resolve(code === 0);
      });

      check.on('error', () => {
        resolve(false);
      });
    });
  }

  async installYouTubeDL() {
    return new Promise((resolve, reject) => {
      console.log('Installing yt-dlp via pip...');
      const install = spawn('pip3', ['install', 'yt-dlp']);

      install.stdout.on('data', (data) => {
        console.log(data.toString());
      });

      install.stderr.on('data', (data) => {
        console.error(data.toString());
      });

      install.on('close', (code) => {
        if (code === 0) {
          console.log('yt-dlp installed successfully!');
          resolve();
        } else {
          reject(new Error('Failed to install yt-dlp'));
        }
      });

      install.on('error', (error) => {
        reject(new Error(`Failed to install yt-dlp: ${error.message}`));
      });
    });
  }

  async getTranscript(videoUrl) {
    try {
      const hasYtDlp = await this.checkYouTubeDL();
      if (!hasYtDlp) {
        await this.installYouTubeDL();
      }

      const videoId = this.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      console.log(`Extracting transcript for video ID: ${videoId}`);

      return new Promise((resolve, reject) => {
        // Clean up any existing subtitle files for this video
        this.cleanupSubtitleFiles(videoId);

        const ytDlp = spawn('python3', [
          '-m', 'yt_dlp',
          '--write-auto-sub',
          '--write-sub',
          '--sub-lang', 'en',
          '--sub-format', 'vtt',
          '--skip-download',
          '--output', path.join(this.outputDir, '%(title)s.%(ext)s'),
          videoUrl
        ]);

        let stdout = '';
        let stderr = '';

        ytDlp.stdout.on('data', (data) => {
          stdout += data.toString();
          console.log(data.toString());
        });

        ytDlp.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
          if (code === 0) {
            console.log('Subtitle extraction completed!');
            this.findAndProcessSubtitles(videoId)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get YouTube transcript: ${error.message}`);
    }
  }

  cleanupSubtitleFiles(videoId) {
    try {
      const files = fs.readdirSync(this.outputDir);
      const subtitleFiles = files.filter(file =>
        file.includes('.vtt') && (file.includes(videoId) || file.includes('.en.vtt'))
      );

      subtitleFiles.forEach(file => {
        const filePath = path.join(this.outputDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.warn('Failed to cleanup subtitle files:', error.message);
    }
  }

  async findAndProcessSubtitles(videoId) {
    const files = fs.readdirSync(this.outputDir);
    const subtitleFiles = files.filter(file =>
      file.includes('.en.vtt') ||
      file.includes('.en-US.vtt') ||
      (file.includes('.vtt') && !file.includes('.live_chat.'))
    );

    if (subtitleFiles.length === 0) {
      throw new Error('No subtitle files found. The video may not have English subtitles available.');
    }

    console.log(`Found subtitle files: ${subtitleFiles.join(', ')}`);

    const subtitleFile = subtitleFiles[0];
    const subtitlePath = path.join(this.outputDir, subtitleFile);

    const transcript = this.parseVTT(subtitlePath);

    // Clean up the subtitle file after processing
    try {
      fs.unlinkSync(subtitlePath);
    } catch (error) {
      console.warn('Failed to cleanup subtitle file:', error.message);
    }

    return transcript;
  }

  parseVTT(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const transcript = [];
    let currentEntry = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and VTT headers
      if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) {
        continue;
      }

      // Check if line contains timestamp
      if (line.includes('-->')) {
        const [start, end] = line.split(' --> ');
        currentEntry = {
          start: this.parseTimestamp(start),
          end: this.parseTimestamp(end),
          text: ''
        };
      } else if (currentEntry && line) {
        // Remove HTML tags and clean up text
        const cleanText = line.replace(/<[^>]*>/g, '').trim();
        if (cleanText) {
          currentEntry.text += (currentEntry.text ? ' ' : '') + cleanText;
        }

        // If next line is timestamp or empty, save current entry
        if (i + 1 >= lines.length || lines[i + 1].includes('-->') || !lines[i + 1].trim()) {
          if (currentEntry.text) {
            transcript.push(currentEntry);
          }
          currentEntry = null;
        }
      }
    }

    return transcript;
  }

  parseTimestamp(timestamp) {
    const parts = timestamp.split(':');
    const seconds = parts.pop().split(',')[0];
    const minutes = parts.pop() || '0';
    const hours = parts.pop() || '0';

    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
  }

  formatTranscript(transcript) {
    let formatted = '';

    for (const entry of transcript) {
      formatted += `${entry.text} `;
    }

    return formatted.trim();
  }

  async extractVideoInfo(videoUrl, { timeoutMs = 15000 } = {}) {
    try {
      const videoId = this.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      return await new Promise((resolve, reject) => {
        const ytDlp = spawn('python3', [
          '-m', 'yt_dlp',
          '--dump-json',
          '--no-download',
          '--socket-timeout', '10',
          videoUrl
        ]);

        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(value);
        };

        const timer = setTimeout(() => {
          try {
            ytDlp.kill('SIGKILL');
          } catch (_) {
            // ignore
          }
          finish(reject, new Error(`yt-dlp video info timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        ytDlp.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        ytDlp.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ytDlp.on('error', (error) => {
          finish(reject, new Error(`Failed to start yt-dlp: ${error.message}`));
        });

        ytDlp.on('close', (code) => {
          if (code === 0) {
            try {
              const videoInfo = JSON.parse(stdout);
              const chapters = Array.isArray(videoInfo.chapters)
                ? videoInfo.chapters.map((ch) => ({
                    start: typeof ch.start_time === 'number' ? ch.start_time : 0,
                    end: typeof ch.end_time === 'number' ? ch.end_time : null,
                    title: ch.title || 'Chapter',
                    source: 'youtube',
                  }))
                : [];
              finish(resolve, {
                title: videoInfo.title,
                description: videoInfo.description,
                duration: videoInfo.duration,
                uploader: videoInfo.uploader,
                upload_date: videoInfo.upload_date,
                view_count: videoInfo.view_count,
                like_count: videoInfo.like_count,
                channel: videoInfo.channel,
                tags: videoInfo.tags,
                thumbnail:
                  videoInfo.thumbnail ||
                  (Array.isArray(videoInfo.thumbnails) && videoInfo.thumbnails.length
                    ? videoInfo.thumbnails[videoInfo.thumbnails.length - 1].url
                    : null),
                chapters,
              });
            } catch (parseError) {
              finish(reject, new Error('Failed to parse video information'));
            }
          } else {
            finish(reject, new Error(summarizeYtDlpFailure(stderr)));
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  async processWithYtDlp(url) {
    const [videoInfo, transcript] = await Promise.all([
      this.extractVideoInfo(url),
      this.getTranscript(url),
    ]);

    const cues = (transcript || [])
      .map((entry) => ({
        start: entry.start,
        end: entry.end,
        text: String(entry.text || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((c) => c.text);

    const content = this.formatTranscript(cues.length ? cues : transcript);

    if (!content || content.length < 100) {
      throw new Error(
        'Transcript is too short or unavailable. The video may not have English subtitles.'
      );
    }

    return {
      success: true,
      provider: 'ytdlp',
      mode: 'raw',
      content,
      cues,
      title: videoInfo.title,
      excerpt: content.substring(0, 200) + '...',
      url,
      chapters: videoInfo.chapters || [],
      videoInfo: {
        ...videoInfo,
        transcript_length: content.length,
        transcript_entries: cues.length || transcript.length,
      },
    };
  }

  /**
   * Prefer Transcript24 (timed captions); fall back to yt-dlp VTT.
   * Always returns cues when successful.
   *
   * @param {string} url
   * @param {{ transcript24TimeoutMs?: number, metaTimeoutMs?: number, allowYtDlpFallback?: boolean, skipYtDlpMeta?: boolean }} [options]
   */
  async processYouTubeUrl(url, options = {}) {
    if (!this.isYouTubeUrl(url)) {
      throw new Error('URL is not a valid YouTube URL');
    }

    const transcript24TimeoutMs = options.transcript24TimeoutMs ?? 60000;
    const metaTimeoutMs = options.metaTimeoutMs ?? 8000;
    const allowYtDlpFallback = options.allowYtDlpFallback === true;
    const skipYtDlpMeta = Boolean(options.skipYtDlpMeta);

    // 1) Transcript24 primary
    if (transcript24Service.isConfigured()) {
      try {
        console.log('📝 Fetching transcript via Transcript24...');
        const t24 = await transcript24Service.transcribe(url, {
          prefer: 'auto',
          timeoutMs: transcript24TimeoutMs,
        });

        // Optionally enrich chapters/thumbnail from yt-dlp (best-effort, short timeout)
        let chapters = Array.isArray(t24.videoInfo?.chapters) ? t24.videoInfo.chapters : [];
        let enrichedInfo = { ...t24.videoInfo };
        if (!skipYtDlpMeta) {
          try {
            const ytMeta = await this.extractVideoInfo(url, { timeoutMs: metaTimeoutMs });
            if ((!chapters || !chapters.length) && ytMeta.chapters?.length) {
              chapters = ytMeta.chapters;
            }
            enrichedInfo = {
              ...enrichedInfo,
              title: enrichedInfo.title || ytMeta.title,
              duration: enrichedInfo.duration ?? ytMeta.duration,
              thumbnail: enrichedInfo.thumbnail || ytMeta.thumbnail,
              channel: enrichedInfo.channel || ytMeta.channel || ytMeta.uploader,
              description: enrichedInfo.description || ytMeta.description,
            };
          } catch (metaErr) {
            console.warn('yt-dlp meta enrich skipped:', metaErr.message);
          }
        }

        return {
          success: true,
          provider: 'transcript24',
          mode: t24.mode,
          taskCredits: t24.taskCredits,
          content: t24.content,
          cues: t24.cues,
          title: enrichedInfo.title || t24.title,
          excerpt: t24.content.substring(0, 200) + '...',
          url,
          chapters,
          videoInfo: {
            ...enrichedInfo,
            transcript_length: t24.content.length,
            transcript_entries: t24.cues.length,
          },
        };
      } catch (t24Err) {
        console.warn(
          `Transcript24 failed (${t24Err.code || 'error'}): ${t24Err.message}. Falling back to yt-dlp.`
        );
        if (!allowYtDlpFallback) {
          return {
            success: false,
            error: `Transcript24 failed: ${t24Err.message}. yt-dlp fallback skipped (YouTube blocks it from most laptops).`,
          };
        }
      }
    } else if (allowYtDlpFallback) {
      console.log('TRANSCRIPT24_API_KEY not set — using yt-dlp transcript path');
    } else {
      return {
        success: false,
        error:
          'TRANSCRIPT24_API_KEY is not set. yt-dlp fallback skipped — YouTube returns 429 / bot-check from local machines. Copy the key into backend/.env or probe the live API with --remote.',
      };
    }

    // 2) yt-dlp fallback (often unavailable in Alpine/prod — keep short failure path)
    try {
      return await withTimeout(this.processWithYtDlp(url), 45000, 'yt-dlp transcript');
    } catch (error) {
      return {
        success: false,
        error: summarizeYtDlpFailure(error.message || ''),
      };
    }
  }
}

export const youtubeTranscriptService = new YouTubeTranscriptService();