# Paper Builder Demo（国际课程组卷系统 · 演示版）

A demo deployment of the paper-builder system (question bank + smart paper assembly + online answering) running in **pure static demo mode** — no backend; data lives in `sessionStorage` and resets when the tab closes.

## Try it

- Teacher login: `teacher` / `zx123456` (or `wangli` / `zx123456`)
- Student online answering: open `answer.html` and enter code **`ZX2026`** with a candidate name (陈思远 / 郎博文 / 林晓雅 / 周子墨 / 吴悦然 / 郑好)
- Seeded with 53 original questions (IELTS / TOEFL / A-Level / AP) incl. one audio question and one KaTeX math question, 3 sample papers, 6-student roster, 1 sample graded exam

## Notes

- Demo mode disables upload / Excel import / audit log (server features). Run `python backend/app.py` locally for the full experience.
- All questions and sample data are original, written for demo purposes.
