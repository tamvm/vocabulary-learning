# Phase 3 — Summary + chapters

## Goal
Show main-ideas summary; chapter navigation from YouTube or AI.

## Tasks
- T3.1 AI summarize (+ chapter when needed) in `aiService`
- T3.2 Prefer YT chapters; else AI if video long enough
- T3.3 Persist `summary` / `chapters` on lesson
- T3.4 Summary panel + ChapterBar → seek
- T3.5 Loading state if generation is slow/split

## Rules
- YT chapters → use as-is (`source: 'youtube'`), still summarize
- No YT chapters + long video → AI chapters mapped to cue starts
- Short video → summary only

## Done when
- Study shows summary always
- Chapter chips appear when chapters exist and seek correctly
