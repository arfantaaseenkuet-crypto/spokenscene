import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your key in the Settings > Secrets panel.'
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status >= 400 && status < 600) {
      return status;
    }
  }
  return 500;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    const raw = error.message.trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown };
        if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) {
          return parsed.error.message.trim();
        }
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
          return parsed.message.trim();
        }
      } catch {
        // Fall through to raw error message
      }
    }
    return raw;
  }
  return fallback;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.post('/api/scene', async (_req: Request, res: Response) => {
    try {
      const ai = getGeminiClient();
      const prompt = [
        'Write a vivid, concrete, everyday scene description in exactly 10 sentences.',
        'The scene must be a single cohesive outdoor or semi-outdoor busy everyday setting that clearly includes:',
        'people, animals, trees, water, furniture, and specific observable actions.',
        'Write plain descriptive sentences only—no bullet points, no numbering, and no introductory or closing remarks.',
        'Make each sentence focus on a distinct visual element so all 10 elements are easy to spot in an illustration.',
      ].join(' ');

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const description = response.text?.trim();
      if (!description) {
        res.status(502).json({ error: 'Gemini returned an empty scene description.' });
        return;
      }

      res.json({ description });
    } catch (error) {
      const status = getErrorStatus(error);
      res.status(status).json({
        error: getErrorMessage(error, 'Failed to generate scene description.'),
      });
    }
  });

  app.post('/api/grade', async (req: Request, res: Response) => {
    try {
      const body = req.body as { originalScene?: unknown; studentTranscript?: unknown };
      const originalScene =
        typeof body?.originalScene === 'string' ? body.originalScene.trim() : '';
      const studentTranscript =
        typeof body?.studentTranscript === 'string' ? body.studentTranscript.trim() : '';

      if (!originalScene || !studentTranscript) {
        res.status(400).json({
          error: 'Both originalScene and studentTranscript are required for grading.',
        });
        return;
      }

      if (originalScene.length > 10000 || studentTranscript.length > 20000) {
        res.status(400).json({ error: 'Input text exceeds maximum allowed length.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = [
        'You are an English speaking test examiner grading a picture-description response.',
        'Compare the student spoken transcript against the original 10-sentence scene description.',
        'Evaluate how many of the 10 key visual elements (people, animals, trees, water, furniture, actions, and setting details) the student accurately described.',
        'Be fair to natural paraphrasing or synonyms, but do not award credit for elements not mentioned.',
        '',
        'Original 10-sentence scene description:',
        originalScene,
        '',
        'Student spoken transcript:',
        studentTranscript,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scorePercent: {
                type: Type.INTEGER,
                description:
                  'Percentage score from 0 to 100 based on how many of the 10 key elements were accurately described.',
              },
              matchedElements: {
                type: Type.INTEGER,
                description:
                  'Number of key scene elements from 0 to 10 accurately described by the student.',
              },
              feedback: {
                type: Type.STRING,
                description:
                  'Short, constructive 2-to-3 sentence feedback highlighting strengths and missed visual details.',
              },
            },
            required: ['scorePercent', 'matchedElements', 'feedback'],
          },
        },
      });

      const rawJson = response.text?.trim();
      if (!rawJson) {
        res.status(502).json({ error: 'Gemini returned an empty grading response.' });
        return;
      }

      const parsed = JSON.parse(rawJson) as {
        scorePercent?: unknown;
        matchedElements?: unknown;
        feedback?: unknown;
      };

      const scorePercent = Math.max(0, Math.min(100, Math.round(Number(parsed.scorePercent) || 0)));
      const matchedElements = Math.max(
        0,
        Math.min(10, Math.round(Number(parsed.matchedElements) || 0))
      );
      const feedback =
        typeof parsed.feedback === 'string' && parsed.feedback.trim()
          ? parsed.feedback.trim()
          : 'Grading complete.';

      res.json({ scorePercent, matchedElements, feedback });
    } catch (error) {
      const status = getErrorStatus(error);
      res.status(status).json({
        error: getErrorMessage(error, 'Failed to grade spoken response.'),
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
