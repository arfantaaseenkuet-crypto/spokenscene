import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-4-hydrogen';

interface CuratedScene {
  id: string;
  title: string;
  imageUrl: string;
  keywords: string[];
  elements: string[];
}

const WEB_SCENE_TOPICS: string[] = [
  'pedestrians zebra crossing city street',
  'outdoor fruit vegetable market stall',
  'office meeting whiteboard coworkers',
  'railway station platform commuters train',
  'school classroom students teacher',
  'firefighters fire truck street rescue',
  'construction workers building site',
  'family picnic park grass',
  'airport terminal travelers luggage',
  'cafe barista coffee shop customers',
  'hospital doctor nurse patient',
  'bicycle repair workshop mechanic',
  'sunny beach swimmers umbrellas',
  'public library students reading books',
  'bakery shop bread counter',
  'rainy street people umbrellas',
  'farm tractor harvest field',
  'supermarket grocery aisle shopping cart',
  'children playground swings park',
  'city bus stop passengers waiting',
  'art classroom students painting',
  'street musicians plaza crowd',
  'post office mail counter',
  'youth soccer match field',
];

const webSceneCache = new Map<string, CuratedScene>();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SUBMISSIONS_FILE = path.resolve(DATA_DIR, 'submissions.json');
const TEACHER_CONFIG_FILE = path.resolve(DATA_DIR, 'teacher-config.json');

interface StudentSubmission {
  id: string;
  submittedAt: string;
  sceneId: string;
  sceneTitle: string;
  scorePercent: number;
  baseScorePercent: number;
  deductionPercent: number;
  matchedElements: number;
  grammarMistakes: Array<{ mistake: string; correction: string; explanation: string }>;
  spokenTranscript: string;
  feedback: string;
  keywords: string[];
  elements: string[];
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readSubmissions(): StudentSubmission[] {
  try {
    if (!fs.existsSync(SUBMISSIONS_FILE)) return [];
    const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudentSubmission[]) : [];
  } catch {
    return [];
  }
}

function recordStudentSubmission(entry: StudentSubmission): void {
  try {
    ensureDataDir();
    const existing = readSubmissions();
    const updated = [entry, ...existing].slice(0, 200);
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch {
    // Ignore disk write failures without breaking student grading
  }
}

async function verifyTeacherBearer(
  req: Request
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Google sign-in is required.' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Missing access token.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  let email = '';
  let emailVerified = false;

  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!infoRes.ok) {
      return { ok: false, status: 401, error: 'Google session expired. Please sign in again.' };
    }
    const info = (await infoRes.json()) as { email?: unknown; email_verified?: unknown };
    email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
    emailVerified = info.email_verified === true;
  } catch {
    return { ok: false, status: 502, error: 'Unable to verify Google account right now.' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!email || !emailVerified) {
    return { ok: false, status: 403, error: 'A verified Google email is required.' };
  }

  const configuredTeacher = (process.env.TEACHER_EMAIL || '').trim().toLowerCase();
  if (configuredTeacher) {
    if (email !== configuredTeacher) {
      return { ok: false, status: 403, error: 'Access denied for this Google account.' };
    }
    return { ok: true, email };
  }

  ensureDataDir();
  if (fs.existsSync(TEACHER_CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(TEACHER_CONFIG_FILE, 'utf8')) as {
        teacherEmail?: unknown;
      };
      const claimed =
        typeof cfg.teacherEmail === 'string' ? cfg.teacherEmail.trim().toLowerCase() : '';
      if (claimed && claimed !== email) {
        return { ok: false, status: 403, error: 'Access denied: teacher portal belongs to another account.' };
      }
      return { ok: true, email };
    } catch {
      return { ok: false, status: 500, error: 'Unable to read teacher access config.' };
    }
  }

  try {
    fs.writeFileSync(
      TEACHER_CONFIG_FILE,
      JSON.stringify({ teacherEmail: email, claimedAt: new Date().toISOString() }, null, 2),
      { encoding: 'utf8', flag: 'wx' }
    );
  } catch {
    const cfg = JSON.parse(fs.readFileSync(TEACHER_CONFIG_FILE, 'utf8')) as {
      teacherEmail?: unknown;
    };
    const claimed =
      typeof cfg.teacherEmail === 'string' ? cfg.teacherEmail.trim().toLowerCase() : '';
    if (claimed && claimed !== email) {
      return { ok: false, status: 403, error: 'Access denied: teacher portal belongs to another account.' };
    }
  }

  return { ok: true, email };
}

// Curated fallback ESL picture-description incident scenes (10-15 keypoints + 10 Class 8-9 sentences)
const CURATED_SCENES: CuratedScene[] = [
  {
    id: 'road_crossing',
    title: 'Busy City Zebra Crossing',
    imageUrl: '/src/assets/images/scene_road_crossing_1795657887637.jpg',
    keywords: [
      'two schoolgirls',
      'blue backpack',
      'red backpack',
      'woman',
      'red umbrella',
      'police officer',
      'yellow vest',
      'whistle',
      'zebra crossing',
      'yellow taxi',
      'red buses',
      'traffic light',
      'brick buildings',
      'sidewalk pedestrians',
    ],
    elements: [
      'Two schoolgirls in dark uniforms are crossing the busy street together.',
      'One girl carries a blue backpack and the other carries a red backpack.',
      'A woman in a dark coat walks beside them on the white zebra crossing.',
      'She is holding a closed red umbrella in her right hand.',
      'A police officer in a bright yellow vest stands on the right side.',
      'He is blowing a whistle and raising his hand to control traffic.',
      'A yellow taxi is stopped behind the white line waiting for pedestrians.',
      'Two red double-decker buses are driving down the road behind the taxi.',
      'A tall traffic light shows a red hand signal for pedestrians.',
      'People are walking along the sidewalk past shops and a cafe.',
    ],
  },
  {
    id: 'office_workday',
    title: 'Busy Office Meeting & Workday',
    imageUrl: '/src/assets/images/scene_office_workday_1795657887625.jpg',
    keywords: [
      'man in blue shirt',
      'whiteboard',
      'line chart',
      'office meeting',
      'two coworkers',
      'laptops',
      'wooden desk',
      'woman carrying folders',
      'white printer',
      'coffee mug',
      'notebooks',
      'bookshelf',
      'tall windows',
      'office chairs',
    ],
    elements: [
      'A man in a blue shirt is standing beside a large whiteboard.',
      'He is pointing at a line chart during a team meeting.',
      'A woman in a dark jacket listens closely in front of the whiteboard.',
      'Two coworkers sit side by side at a long wooden desk.',
      'Both of them are typing on open laptops while working.',
      'A woman walks past the desks carrying a stack of colorful folders.',
      'A white printer sits on a small brown table in the middle of the room.',
      'There is a coffee mug, a blue pen, and notebooks on the front desk.',
      'Another worker in a red shirt uses a computer near the bright windows.',
      'Wooden bookshelves filled with binders stand along the wall.',
    ],
  },
  {
    id: 'market_stall',
    title: 'Outdoor Fruit & Vegetable Market',
    imageUrl: '/src/assets/images/scene_market_stall_1795657888459.jpg',
    keywords: [
      'shopkeeper',
      'striped apron',
      'red tomatoes',
      'metal scale',
      'mother',
      'young boy',
      'woven basket',
      'older man',
      'yellow bananas',
      'wooden crates',
      'chalkboard price sign',
      'striped awning',
      'oranges and apples',
      'street shoppers',
    ],
    elements: [
      'A smiling shopkeeper in a striped apron works behind an outdoor market stall.',
      'She is scooping red tomatoes onto a metal weighing scale.',
      'A mother in a denim jacket holds a woven shopping basket.',
      'Her young son in a blue hoodie stands beside her looking at the fruit.',
      'An older man wearing glasses inspects fresh yellow bananas.',
      'Bananas, carrots, oranges, and green apples fill wooden crates.',
      'A black chalkboard sign hangs above the stall showing fruit and vegetable prices.',
      'A red-and-white striped awning covers the market stand.',
      'Other shoppers are walking along the cobblestone street behind the stall.',
      'Green cloth covers the long table holding the fresh produce.',
    ],
  },
  {
    id: 'railway_platform',
    title: 'Busy Railway Station Platform',
    imageUrl: '/src/assets/images/scene_railway_platform_1795657888909.jpg',
    keywords: [
      'blue train',
      'ticket inspector',
      'woman in red jacket',
      'father and daughter',
      'black suitcase',
      'red suitcase',
      'metal bench',
      'man reading newspaper',
      'brown leather bag',
      'station clock',
      'yellow safety line',
      'departure screen',
      'platform sign',
      'commuters',
    ],
    elements: [
      'A blue passenger train is stopped beside a busy railway platform.',
      'A uniformed ticket inspector stands by the train door checking a ticket.',
      'A woman wearing a red jacket and backpack shows him her ticket.',
      'A father and his young daughter in a pink coat walk along the platform.',
      'They are pulling a black suitcase and a small red suitcase.',
      'An older man in a brown jacket sits on a black metal bench.',
      'He is reading a folded newspaper with a brown leather bag next to him.',
      'A large round station clock hangs overhead above the crowd.',
      'A bright yellow safety line runs along the edge of the platform.',
      'Digital departure boards and platform signs hang under the station roof.',
    ],
  },
  {
    id: 'science_fair',
    title: 'Classroom Science Fair Exhibition',
    imageUrl: '/src/assets/images/scene_science_fair_1795657889562.jpg',
    keywords: [
      'three students',
      'volcano model',
      'solar toy car',
      'desk lamp',
      'teacher',
      'clipboard',
      'trifold poster board',
      'microscope',
      'glass beakers',
      'test tubes',
      'small fan',
      'classroom table',
      'science fair t-shirt',
      'other visitors',
    ],
    elements: [
      'Three smiling students stand behind a long table at a school science fair.',
      'A boy in a blue Science Fair T-shirt stands beside a black microscope.',
      'A girl in a red hoodie looks at a foaming brown volcano model.',
      'A boy in a green T-shirt and glasses points at a small solar toy car.',
      'A bright desk lamp shines onto the solar panel of the toy car.',
      'A smiling teacher in a dark jacket holds a clipboard on the right.',
      'A colorful poster board behind them explains volcanoes and solar energy.',
      'Clear glass beakers and test tubes sit at the front of the table.',
      'A small silver fan rests beside the demonstration track.',
      'Other students and visitors walk past more project tables in the classroom.',
    ],
  },
];

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

function isTransientError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429 || status === 503 || status === 502 || status === 504) {
    return true;
  }
  const msg = getErrorMessage(error, '').toLowerCase();
  return (
    msg.includes('high demand') ||
    msg.includes('temporarily') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: string;
    responseSchema: Record<string, unknown>;
  }
): Promise<string> {
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; delayMs: number }> = [
    { model: FALLBACK_MODEL, thinkingLevel: ThinkingLevel.MEDIUM, delayMs: 0 },
    { model: FALLBACK_MODEL, thinkingLevel: ThinkingLevel.LOW, delayMs: 700 },
    { model: PRIMARY_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 400 },
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config: {
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      });
      const text = response.text?.trim();
      if (text) {
        return text;
      }
      lastError = new Error('Model returned an empty response.');
    } catch (error) {
      lastError = error;
      if (!isTransientError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('Unable to reach the Gemini API.');
}

function countTranscriptSentences(transcript: string): number {
  const punctuationSplit = transcript
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);

  if (punctuationSplit.length >= 2) {
    return punctuationSplit.length;
  }

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return Math.floor(wordCount / 7);
}

async function searchWikimediaImage(
  keywords: string[],
  excludePageIds: Set<string> = new Set()
): Promise<string | null> {
  const cleanedKeywords = keywords
    .map((k) =>
      k
        .replace(/bright clear daytime documentary photograph/gi, '')
        .replace(/exactly/gi, '')
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .trim()
    )
    .filter((k) => k.length >= 2);

  const queries: string[] = [];
  if (cleanedKeywords.length >= 3) {
    queries.push(cleanedKeywords.slice(0, 3).join(' '));
  }
  if (cleanedKeywords.length >= 2) {
    queries.push(cleanedKeywords.slice(0, 2).join(' '));
  }
  if (cleanedKeywords.length >= 1) {
    queries.push(cleanedKeywords[0]);
  }

  for (const rawQuery of queries) {
    const query = `${rawQuery} filetype:bitmap`;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=960&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'SpeakSceneApp/1.0 (https://aistudio.google.com)' },
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const data = (await response.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              pageid?: number;
              imageinfo?: Array<{
                url?: string;
                thumburl?: string;
                mime?: string;
                width?: number;
                height?: number;
              }>;
            }
          >;
        };
      };

      const pages = Object.values(data?.query?.pages || {});
      const candidates: string[] = [];
      for (const page of pages) {
        if (page.pageid && excludePageIds.has(`web_${page.pageid}`)) {
          continue;
        }
        const info = page.imageinfo?.[0];
        if (!info) continue;
        const mime = (info.mime || '').toLowerCase();
        if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
          continue;
        }
        const candidateUrl = info.thumburl || info.url || '';
        if (
          (candidateUrl.startsWith('https://upload.wikimedia.org/') ||
            candidateUrl.startsWith('https://thumb.wikimedia.org/')) &&
          (info.width || 0) >= 400
        ) {
          candidates.push(candidateUrl);
        }
      }
      if (candidates.length > 0) {
        const pickIndex = Math.floor(Math.random() * Math.min(3, candidates.length));
        return candidates[pickIndex];
      }
    } catch {
      // Try shorter keyword query
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

async function fetchDynamicWebScene(
  excludeId: string,
  deviceCounts: Record<string, unknown>
): Promise<CuratedScene | null> {
  const shuffledTopics = [...WEB_SCENE_TOPICS].sort(() => Math.random() - 0.5);

  for (const topic of shuffledTopics.slice(0, 3)) {
    const query = `${topic} filetype:bitmap`;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=960&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'SpeakSceneApp/1.0 (https://aistudio.google.com)' },
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const data = (await response.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              pageid?: number;
              imageinfo?: Array<{
                url?: string;
                thumburl?: string;
                mime?: string;
                width?: number;
                height?: number;
              }>;
            }
          >;
        };
      };

      const pages = Object.values(data?.query?.pages || {});
      const eligibleCandidates: Array<{ sceneId: string; imageUrl: string; count: number }> = [];

      for (const page of pages) {
        if (!page.pageid) continue;
        const sceneId = `web_${page.pageid}`;
        const usedCount = Math.max(0, Number(deviceCounts[sceneId]) || 0);
        if (usedCount >= 2 || sceneId === excludeId) continue;

        const info = page.imageinfo?.[0];
        if (!info) continue;
        const mime = (info.mime || '').toLowerCase();
        if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') continue;

        const width = info.width || 0;
        const height = info.height || 0;
        if (width < 500 || height < 350 || width < height * 0.75) continue;

        const candidateUrl = info.thumburl || info.url || '';
        if (
          candidateUrl.startsWith('https://upload.wikimedia.org/') ||
          candidateUrl.startsWith('https://thumb.wikimedia.org/')
        ) {
          eligibleCandidates.push({ sceneId, imageUrl: candidateUrl, count: usedCount });
        }
      }

      if (eligibleCandidates.length === 0) continue;

      const minCount = Math.min(...eligibleCandidates.map((c) => c.count));
      const bestPool = eligibleCandidates.filter((c) => c.count === minCount);
      const chosen = bestPool[Math.floor(Math.random() * bestPool.length)];
      if (!chosen) continue;

      const cached = webSceneCache.get(chosen.sceneId);
      if (cached) {
        return cached;
      }

      const imgController = new AbortController();
      const imgTimeoutId = setTimeout(() => imgController.abort(), 7000);
      let dataUrl = '';
      let base64Bytes = '';
      let mimeType = 'image/jpeg';

      try {
        const imgRes = await fetch(chosen.imageUrl, {
          headers: { 'User-Agent': 'SpeakSceneApp/1.0 (https://aistudio.google.com)' },
          signal: imgController.signal,
        });
        const imgMime = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
        if (imgRes.ok && imgMime.startsWith('image/')) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.byteLength > 5000 && buf.byteLength <= 4 * 1024 * 1024) {
            mimeType = imgMime;
            base64Bytes = buf.toString('base64');
            dataUrl = `data:${mimeType};base64,${base64Bytes}`;
          }
        }
      } finally {
        clearTimeout(imgTimeoutId);
      }

      if (!dataUrl || !base64Bytes) continue;

      const ai = getGeminiClient();
      const scenePrompt = [
        'Analyze this real photograph for a Class 8-9 English picture-description speaking test.',
        'Generate:',
        '1. title: A short 3 to 5 word title for this photograph.',
        '2. keywords: 12 concise visual keypoints visible in the photo (with exact people/object counts like "two boys", "red car", "street sign").',
        '3. elements: Exactly 10 simple, clear Class 8-9 English sentences describing the people, actions, and everyday objects visible in the photo.',
      ].join('\n');

      const sceneSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          elements: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'keywords', 'elements'],
      };

      const aiResponse = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Bytes } },
            { text: scenePrompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: sceneSchema,
        },
      });

      const parsed = JSON.parse((aiResponse.text || '').trim()) as {
        title?: unknown;
        keywords?: unknown;
        elements?: unknown;
      };

      const title =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : 'Everyday Street Scene';
      const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 15)
        : [];
      const elements = Array.isArray(parsed.elements)
        ? parsed.elements.filter((e): e is string => typeof e === 'string' && e.trim().length > 0).slice(0, 10)
        : [];

      if (keywords.length < 4 || elements.length < 4) continue;

      const dynamicScene: CuratedScene = {
        id: chosen.sceneId,
        title,
        imageUrl: dataUrl,
        keywords,
        elements,
      };

      if (webSceneCache.size >= 40) {
        const oldestKey = webSceneCache.keys().next().value;
        if (oldestKey) webSceneCache.delete(oldestKey);
      }
      webSceneCache.set(dynamicScene.id, dynamicScene);
      return dynamicScene;
    } catch {
      // Try next topic or fall back to curated scenes
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

async function startServer(): Promise<void> {
  const app = express();

  app.post(
    '/api/transcribe',
    express.json({ limit: '8mb' }),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as { audioBase64?: unknown; mimeType?: unknown };
        const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64.trim() : '';
        const rawMime = typeof body?.mimeType === 'string' ? body.mimeType.trim() : 'audio/webm';
        const cleanMime = rawMime.split(';')[0].trim().toLowerCase();

        const allowedMimes = new Set([
          'audio/webm',
          'audio/ogg',
          'audio/mp4',
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/x-wav',
          'audio/aac',
        ]);

        if (!audioBase64) {
          res.status(400).json({ error: 'Audio recording data is required.' });
          return;
        }

        if (!allowedMimes.has(cleanMime)) {
          res.status(400).json({ error: 'Unsupported audio format.' });
          return;
        }

        const ai = getGeminiClient();
        const audioPart = {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64,
          },
        };
        const instructionPart = {
          text: 'Transcribe only the clear English speech in this audio clip accurately as plain text with natural punctuation. Do not add commentary, speaker labels, timestamps, or brackets. If there is no clear speech, output an empty string.',
        };

        const modelsToTry = ['gemini-3.5-transcribe', PRIMARY_MODEL];
        let transcript = '';
        let lastErr: unknown;

        for (const model of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: { parts: [audioPart, instructionPart] },
              ...(model === PRIMARY_MODEL
                ? { config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } }
                : {}),
            });
            const rawText = (response.text || '').trim();
            transcript = rawText
              .replace(/^\[(silence|no speech|inaudible|background noise|music|blank_audio)\]$/gi, '')
              .replace(/^\((silence|no speech|inaudible|background noise|music)\)$/gi, '')
              .trim();
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }

        if (lastErr) {
          throw lastErr;
        }

        res.json({ transcript });
      } catch (error) {
        const status = getErrorStatus(error);
        res.status(status).json({
          error: getErrorMessage(error, 'Audio transcription failed.'),
        });
      }
    }
  );

  app.use(express.json({ limit: '100kb' }));

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const body = req.body as { text?: unknown; sceneId?: unknown };
      const sceneId = typeof body?.sceneId === 'string' ? body.sceneId.trim() : '';
      let text = typeof body?.text === 'string' ? body.text.trim() : '';

      if (!text && sceneId) {
        const matched = webSceneCache.get(sceneId) || CURATED_SCENES.find((s) => s.id === sceneId);
        if (matched) {
          text = matched.elements.join(' ');
        }
      }

      if (!text) {
        res.status(400).json({ error: 'Description text is required for voice playback.' });
        return;
      }

      const clippedText = text.slice(0, 3500);
      const maleVoices = ['Charon', 'Fenrir', 'Puck'];
      const femaleVoices = ['Kore', 'Zephyr'];
      const voiceGender = Math.random() < 0.5 ? 'male' : 'female';
      const voicePool = voiceGender === 'male' ? maleVoices : femaleVoices;
      const voiceName = voicePool[Math.floor(Math.random() * voicePool.length)];

      const ai = getGeminiClient();
      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: clippedText,
                speechMetadata: {
                  style: 'Clear, natural English teacher describing a picture at a steady pace for students',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        res.status(502).json({ error: 'Voice model returned empty audio.' });
        return;
      }

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
        voiceGender,
        voiceName,
      });
    } catch (error) {
      const status = getErrorStatus(error);
      res.status(status).json({
        error: getErrorMessage(error, 'Unable to generate voice description.'),
      });
    }
  });

  app.post('/api/scene', async (req: Request, res: Response) => {
    const body = req.body as {
      excludeId?: unknown;
      deviceCounts?: unknown;
    };
    const excludeId = typeof body?.excludeId === 'string' ? body.excludeId : '';
    const deviceCounts =
      body?.deviceCounts && typeof body.deviceCounts === 'object' && !Array.isArray(body.deviceCounts)
        ? (body.deviceCounts as Record<string, unknown>)
        : {};

    // Prefer fresh real-world photographs from the web so images do not repeat across versions/tests
    const dynamicScene = await fetchDynamicWebScene(excludeId, deviceCounts);
    if (dynamicScene) {
      res.json({
        sceneId: dynamicScene.id,
        title: dynamicScene.title,
        imageUrl: dynamicScene.imageUrl,
        keywords: dynamicScene.keywords,
        elements: dynamicScene.elements,
        description: dynamicScene.elements.join(' '),
      });
      return;
    }

    const eligible = CURATED_SCENES.filter((scene) => {
      const count = Number(deviceCounts[scene.id]) || 0;
      return count < 2;
    });

    if (eligible.length === 0) {
      res.status(409).json({
        error:
          'You have completed every scene up to the 2-time limit on this device.',
      });
      return;
    }

    const nonRepeating = eligible.filter((scene) => scene.id !== excludeId);
    const candidates = nonRepeating.length > 0 ? nonRepeating : eligible;

    const minCount = Math.min(
      ...candidates.map((scene) => Math.max(0, Number(deviceCounts[scene.id]) || 0))
    );
    const lowestUsedPool = candidates.filter(
      (scene) => Math.max(0, Number(deviceCounts[scene.id]) || 0) === minCount
    );

    const chosen =
      lowestUsedPool[Math.floor(Math.random() * lowestUsedPool.length)] || candidates[0];

    res.json({
      sceneId: chosen.id,
      title: chosen.title,
      imageUrl: chosen.imageUrl,
      keywords: chosen.keywords,
      elements: chosen.elements,
      description: chosen.elements.join(' '),
    });
  });

  app.post('/api/grade', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        sceneId?: unknown;
        originalScene?: unknown;
        studentTranscript?: unknown;
      };
      const sceneId = typeof body?.sceneId === 'string' ? body.sceneId.trim() : '';
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

      const matchedScene =
        webSceneCache.get(sceneId) || CURATED_SCENES.find((s) => s.id === sceneId);
      const keypointsText = matchedScene
        ? matchedScene.keywords.join(', ')
        : 'people, event, everyday objects, actions';

      const ai = getGeminiClient();
      const prompt = [
        'You are a supportive Class 8-9 English teacher grading a picture-description speaking test.',
        'Evaluate the student spoken transcript using BOTH keypoint matching and spoken English grammar.',
        '',
        '1. Keypoints & Scene Matching:',
        '- Check how many of the scene keypoints and 10 reference ideas the student accurately mentioned (0 to 10).',
        '- Be fair and encouraging with everyday synonyms (for instance, "two girls" matches "two schoolgirls", "cab" matches "yellow taxi", "man in uniform" matches "police officer").',
        '- Count how many relevant descriptive sentences or clauses the student spoke about the scene.',
        '',
        '2. Grammatical & Sentence Mistakes:',
        '- Find ALL real spoken English grammatical and sentence-structure mistakes in the transcript (for example: wrong verb tense, subject-verb agreement like "two girl is", missing plural -s, wrong preposition, missing articles in broken phrases, or incomplete/scrambled sentence structure).',
        '- IMPORTANT: The transcript comes from voice-to-text speech recognition, so NEVER flag missing punctuation, missing commas/periods, or capitalization as mistakes.',
        '- For each real grammatical or sentence mistake, provide the exact short phrase from the student transcript, the corrected English version, and a brief 1-line explanation.',
        '',
        '3. Student Image Keywords & Exact-Count Prompt (10-15 keywords):',
        '- Extract 10 to 15 short, concrete visual phrases representing ONLY what the student actually described in their speech.',
        '- Put exact people/object counts FIRST in the list (e.g., if the student said "two girls", start with "exactly two girls walking side by side", never "one girl"). Do NOT add scene details the student did not mention. End with "bright clear daytime documentary photograph".',
        '',
        '4. Feedback:',
        '- Write encouraging 2-sentence teacher feedback in easy Class 8-9 English.',
        '',
        `Scene Keypoints: ${keypointsText}`,
        '',
        'Reference 10 sentences:',
        originalScene,
        '',
        'Student spoken transcript:',
        studentTranscript,
      ].join('\n');

      const schema = {
        type: Type.OBJECT,
        properties: {
          matchedKeypointsCount: {
            type: Type.INTEGER,
            description: 'Number of matched keypoints/elements from 0 to 10.',
          },
          relevantSentences: {
            type: Type.INTEGER,
            description: 'Estimated number of relevant descriptive sentences spoken by the student.',
          },
          grammarMistakes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                mistake: {
                  type: Type.STRING,
                  description: 'Exact phrase with the grammatical or sentence mistake.',
                },
                correction: {
                  type: Type.STRING,
                  description: 'Corrected English phrase.',
                },
                explanation: {
                  type: Type.STRING,
                  description: 'Simple 1-line explanation for a Class 8-9 student.',
                },
              },
              required: ['mistake', 'correction', 'explanation'],
            },
            description: 'List of all spoken grammatical and sentence mistakes found.',
          },
          studentImageKeywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              '10 to 15 concise visual keywords representing only what the student described, preserving exact counts like two girls.',
          },
          feedback: {
            type: Type.STRING,
            description: 'Encouraging 2-sentence teacher feedback.',
          },
        },
        required: [
          'matchedKeypointsCount',
          'relevantSentences',
          'grammarMistakes',
          'studentImageKeywords',
          'feedback',
        ],
      };

      const rawJson = await generateWithRetry(ai, {
        contents: prompt,
        responseSchema: schema,
      });

      const parsed = JSON.parse(rawJson) as {
        matchedKeypointsCount?: unknown;
        relevantSentences?: unknown;
        grammarMistakes?: Array<{
          mistake?: unknown;
          correction?: unknown;
          explanation?: unknown;
        }>;
        studentImageKeywords?: unknown;
        feedback?: unknown;
      };

      let matchedElements = Math.max(
        0,
        Math.min(10, Math.round(Number(parsed.matchedKeypointsCount) || 0))
      );
      const modelSentences = Math.max(0, Math.round(Number(parsed.relevantSentences) || 0));
      const estimatedSentences = Math.max(modelSentences, countTranscriptSentences(studentTranscript));

      // Apply previous encouraging floor rules + new 7-8 keypoints -> 70% rule (before grammar deduction)
      let baseScorePercent = matchedElements * 10;

      if (matchedElements >= 1) {
        matchedElements = Math.max(2, matchedElements);
        baseScorePercent = Math.max(20, baseScorePercent);
      }

      if (estimatedSentences >= 10 && matchedElements >= 1) {
        matchedElements = Math.max(5, matchedElements);
        baseScorePercent = Math.max(50, baseScorePercent);
      }

      if (matchedElements === 7 || matchedElements === 8) {
        baseScorePercent = 70;
      } else if (matchedElements >= 9) {
        baseScorePercent = matchedElements * 10;
      }

      const grammarMistakes = Array.isArray(parsed.grammarMistakes)
        ? parsed.grammarMistakes
            .filter(
              (item) =>
                item &&
                typeof item.mistake === 'string' &&
                item.mistake.trim().length > 0 &&
                typeof item.correction === 'string' &&
                item.correction.trim().length > 0
            )
            .map((item) => ({
              mistake: String(item.mistake).trim(),
              correction: String(item.correction).trim(),
              explanation:
                typeof item.explanation === 'string' && item.explanation.trim()
                  ? item.explanation.trim()
                  : 'Use standard English sentence structure.',
            }))
        : [];

      // 2% negative marking per grammatical mistake
      const deductionPercent = grammarMistakes.length * 2;
      const scorePercent = Math.max(0, baseScorePercent - deductionPercent);

      const keywordsList = Array.isArray(parsed.studentImageKeywords)
        ? parsed.studentImageKeywords
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .slice(0, 15)
        : [];

      const studentImagePrompt =
        keywordsList.length > 0
          ? keywordsList.join(', ')
          : `${studentTranscript.slice(0, 160)}, clear daytime realistic photo`;

      const feedback =
        typeof parsed.feedback === 'string' && parsed.feedback.trim()
          ? parsed.feedback.trim()
          : 'Great effort describing the scene! Review the grammar notes below to make your sentences even stronger.';

      recordStudentSubmission({
        id: crypto.randomUUID(),
        submittedAt: new Date().toISOString(),
        sceneId: sceneId || 'custom',
        sceneTitle: matchedScene?.title || 'English Speaking Test',
        scorePercent,
        baseScorePercent,
        deductionPercent,
        matchedElements,
        grammarMistakes,
        spokenTranscript: studentTranscript,
        feedback,
        keywords: matchedScene?.keywords || [],
        elements: matchedScene?.elements || [],
      });

      res.json({
        scorePercent,
        baseScorePercent,
        deductionPercent,
        matchedElements,
        grammarMistakes,
        studentImageKeywords: keywordsList,
        studentImagePrompt,
        feedback,
      });
    } catch (error) {
      const status = getErrorStatus(error);
      const rawMessage = getErrorMessage(error, 'Failed to grade spoken response.');
      const friendlyMessage =
        status === 429 || rawMessage.toLowerCase().includes('quota')
          ? 'Free-tier AI rate limit reached right now. Please wait a few seconds and click Retry Grading—your transcript is saved.'
          : rawMessage;
      res.status(status).json({ error: friendlyMessage });
    }
  });

  app.get('/api/submissions', async (req: Request, res: Response) => {
    const authCheck = await verifyTeacherBearer(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    res.json({
      teacherEmail: authCheck.email,
      submissions: readSubmissions(),
    });
  });

  app.post('/api/student-image', async (req: Request, res: Response) => {
    const body = req.body as { prompt?: unknown; keywords?: unknown; excludeSceneId?: unknown };
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 1000) : '';
    const excludeSceneId = typeof body?.excludeSceneId === 'string' ? body.excludeSceneId.trim() : '';
    const keywords = Array.isArray(body?.keywords)
      ? body.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      : prompt
          .split(/[,\s]+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 3);

    if (!prompt && keywords.length === 0) {
      res.status(400).json({ error: 'Prompt or keywords are required.' });
      return;
    }

    // 1. Try Pollinations AI with a strict 12-second timeout
    const pollinationsUrl = `https://pollinations.ai/p/${encodeURIComponent(
      prompt || keywords.join(' ')
    )}?width=960&height=720&nologo=true`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const aiRes = await fetch(pollinationsUrl, {
        headers: { 'User-Agent': 'SpeakSceneApp/1.0' },
        signal: controller.signal,
      });
      const contentType = (aiRes.headers.get('content-type') || '').toLowerCase();
      const retryAfter = aiRes.headers.get('retry-after');

      if (aiRes.ok && !retryAfter && contentType.startsWith('image/')) {
        const buffer = Buffer.from(await aiRes.arrayBuffer());
        if (buffer.byteLength > 15000) {
          res.json({
            imageUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
            source: 'pollinations',
          });
          return;
        }
      }
    } catch {
      // Timed out (>12s) or network error — fall back to web keyword image search
    } finally {
      clearTimeout(timeoutId);
    }

    // 2. Pollinations timed out or hit rate limit: search the web using the student's spoken keywords
    const excludeSet = excludeSceneId ? new Set([excludeSceneId]) : new Set<string>();
    const webImageUrl = await searchWikimediaImage(keywords, excludeSet);
    if (webImageUrl) {
      const imgController = new AbortController();
      const imgTimeoutId = setTimeout(() => imgController.abort(), 8000);
      try {
        const imgRes = await fetch(webImageUrl, {
          headers: { 'User-Agent': 'SpeakSceneApp/1.0 (https://aistudio.google.com)' },
          signal: imgController.signal,
        });
        const imgType = (imgRes.headers.get('content-type') || 'image/jpeg').toLowerCase();
        if (imgRes.ok && imgType.startsWith('image/')) {
          const imgBuf = Buffer.from(await imgRes.arrayBuffer());
          if (imgBuf.byteLength > 0 && imgBuf.byteLength <= 4 * 1024 * 1024) {
            res.json({
              imageUrl: `data:${imgType};base64,${imgBuf.toString('base64')}`,
              source: 'web-search',
            });
            return;
          }
        }
      } catch {
        // Fall back to direct Wikimedia URL if inline fetch fails
      } finally {
        clearTimeout(imgTimeoutId);
      }

      res.json({ imageUrl: webImageUrl, source: 'web-search' });
      return;
    }

    res.status(404).json({ error: 'No matching image found for these keywords.' });
  });

  app.use((err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'Audio recording is too large to upload.' });
      return;
    }
    next(err);
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
