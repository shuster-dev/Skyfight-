# חבילת סקילים ל-Claude Code

68 סקילים מקוד פתוח, נבדקו ידנית. לא נמצאו קריאות רשת חשודות ולא נמצאו הוראות זדוניות.

## התקנה

התקנה גלובלית, הסקילים יהיו זמינים בכל פרויקט:

```bash
unzip claude-skills.zip
cp -r claude-skills/skills/* ~/.claude/skills/
```

או להריץ את `bash claude-skills/install.sh`.

התקנה לפרויקט אחד: מעתיקים את `skills/*` לתיקייה `.claude/skills/` שבתוך הריפו.

## מה בפנים

| קבוצה | סקילים | למה זה טוב |
|---|---|---|
| אינסטגרם (13) | `ig-*` | רילס, כיתובים, קרוסלות, סטוריז, תכנון שבועי, humanizer |
| Superpowers (15) | brainstorming, writing-plans, test-driven-development, systematic-debugging ועוד | עבודת פיתוח מסודרת: קודם תכנון, אחר כך בדיקות, ואז קוד |
| Remotion (13) | `remotion-*` | יצירת סרטוני וידאו מקוד: פרומואים, כתוביות, רינדור |
| n8n (15) | `n8n-*` | בניית אוטומציות ובוטים ב-n8n |
| תמונות (11) | `baoyu-*` | יצירת תמונות, קאברים, אינפוגרפיקה, קומיקס, דחיסת תמונות, תמלול יוטיוב |
| יוטיוב (1) | `youtube-clipper` | חיתוך קליפים מסרטון ביוטיוב וצריבת כתוביות |

## מה צריך להתקין בנוסף

- **Remotion**: Node.js. הסקיל יבקש להריץ `npx create-video`.
- **youtube-clipper**: הכלים yt-dlp, ffmpeg ו-pysrt (`pip install pysrt`).
- **baoyu-image-gen**: מפתח API, אחד מהבאים: `GEMINI_API_KEY`, `OPENAI_API_KEY` או `GOOGLE_API_KEY`. צריך גם `bun` או `npx`.
- **n8n**: הכי טוב עם n8n-mcp מחובר.
- **אינסטגרם**: כדאי להעתיק את `templates/voice.md` לנתיב `~/.claude/instagram/voice.md` ולמלא אותו.

## מה הוצאתי מהחבילה ולמה

מהאוסף של baoyu הוצאתי:
- סקילים שמפרסמים ל-Weibo, WeChat, Xiaohongshu ו-X.
- סקילים שמסומנים `danger`, כי הם משתמשים בעוגיות הדפדפן שלך.

## רישיונות

כל הסקילים ברישיון קוד פתוח. קבצי הרישיון של כל ריפו נמצאים בתיקייה `licenses/`. ל-Remotion יש רישיון מסחרי משלו לחברות, כל הפרטים נמצאים בסקיל `remotion-license`.

## מקורות

- github.com/Jakeschincariol/instagram-agent-skill
- github.com/obra/superpowers
- github.com/remotion-dev/skills
- github.com/czlonkowski/n8n-skills
- github.com/JimLiu/baoyu-skills
- github.com/op7418/Youtube-clipper-skill
