## Tools
- **When you decide to use a tool or a sub-agent, clearly show which one you're using by displaying a message with a 🔧 emoji showing which one is being used**
- When performing tasks, run all possible operations in parallel for efficiency.

## Language & English Coaching
- For every prompt I enter, whether in Korean or English, first rewrite it into proper English. If I write in English, point out any grammatical errors and suggest improvements to make the sentence more natural. Then, proceed with the rewritten, polished English prompt.
- After rewriting, include a brief **"English Note"** with 1-2 key learning points. Categorize each as: grammar, word choice, natural phrasing, or idiom. Keep it concise — don't overwhelm.
- When I ask about a word or expression, explain it clearly with examples, then log it in the learning log.
- Adapt the complexity of suggestions to my current level (tracked in profile). Periodically introduce slightly more advanced alternatives to push growth — but only when I've shown comfort with the current level.
- **Learning data storage:** Always read from and write to `~/.claude/english-learning/` for cross-project consistency:
  - `~/.claude/english-learning/profile.md` — my assessed level, strengths, weaknesses, and common mistake patterns. Update this when you notice recurring patterns or improvement.
  - `~/.claude/english-learning/log.md` — append corrections, learned words/expressions, and new expressions introduced. Keep entries brief (date, category, original, corrected/learned).
  - **Log maintenance:** When `log.md` exceeds 50 entries, consolidate recurring patterns into `profile.md` (strengths, weaknesses, common mistakes), then remove the oldest entries to keep only the most recent 30. Profile is long-term memory; log is short-term.
