import { jsPDF } from 'jspdf';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  clearAccessToken,
  logout,
} from './src/googleAuth.ts';
import {
  listUserForms,
  getFormDetails,
  getFormResponses,
  createSpeakingForm,
  uploadTranscriptPdfToDrive,
} from './src/googleForms.ts';

const TEST_DURATION_SECONDS = 120;
const DEVICE_SCENE_COUNTS_KEY = 'speakscene_device_counts_v1';
const IS_MOBILE_BROWSER = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
);

const state = {
  currentScreen: 'home',
  sceneId: '',
  lastSceneId: '',
  sceneTitle: '',
  sceneKeywords: [],
  sceneElements: [],
  sceneDescription: '',
  questionImageUrl: '',
  finalTranscript: '',
  interimTranscript: '',
  lastSpokenText: '',
  lastResult: null,
  remainingSeconds: TEST_DURATION_SECONDS,
  isTesting: false,
  timerStarted: false,
  sessionGeneration: 0,
  hasFatalSpeechError: false,
  hasNativeSpeechResult: false,
  lastLiveSpeechResultAt: 0,
  nativeBackupBuffer: '',
  noiseFloor: 0.004,
  transcribeQueue: Promise.resolve(),
  pendingTranscribeCount: 0,
  pcmCaptureEnabled: false,
  pcmProducedTranscript: false,
  pcmPreRollChunks: [],
  currentSegmentChunks: [],
  currentSegmentSamples: 0,
  segmentHasSpeech: false,
  segmentSilenceMs: 0,
  isAudioRecording: false,
  selectedDeviceId: '',
  recordedMimeType: 'audio/webm',
  recordedChunks: [],
  mediaStream: null,
  mediaRecorder: null,
  audioContext: null,
  analyserNode: null,
  pcmSource: null,
  pcmProcessor: null,
  pcmSilentGain: null,
  meterRafId: null,
  recognition: null,
  timerInterval: null,
  imageFallbackTimer: null,
  sceneAudio: null,
  isSceneAudioPlaying: false,
  isSceneAudioLoading: false,
  previousScreen: 'home',
  googleUser: null,
  needsAuth: true,
  submissions: [],
  userForms: [],
  selectedFormId: '',
};

const dom = {
  homeScreen: document.getElementById('home-screen'),
  testScreen: document.getElementById('test-screen'),
  resultsScreen: document.getElementById('results-screen'),
  formsScreen: document.getElementById('forms-screen'),

  googleUserWrap: document.getElementById('google-user-wrap'),
  googleUserEmail: document.getElementById('google-user-email'),
  googleSignoutBtn: document.getElementById('google-signout-btn'),

  startTestBtn: document.getElementById('start-test-btn'),
  homeError: document.getElementById('home-error'),

  timerDisplay: document.getElementById('timer-display'),
  timerProgress: document.getElementById('timer-progress'),
  finishEarlyBtn: document.getElementById('finish-early-btn'),
  restartMicBtn: document.getElementById('restart-mic-btn'),
  cancelTestBtn: document.getElementById('cancel-test-btn'),
  testError: document.getElementById('test-error'),
  speechWarning: document.getElementById('speech-warning'),

  sceneStatusText: document.getElementById('scene-status-text'),
  questionImageLoading: document.getElementById('question-image-loading'),
  questionLoadingLabel: document.getElementById('question-loading-label'),
  questionImage: document.getElementById('question-image'),
  questionImageFallback: document.getElementById('question-image-fallback'),

  micStatus: document.getElementById('mic-status'),
  micStatusLabel: document.getElementById('mic-status-label'),
  micLevelBar: document.getElementById('mic-level-bar'),
  micDeviceSelect: document.getElementById('mic-device-select'),
  transcriptPlaceholder: document.getElementById('transcript-placeholder'),
  finalTranscriptEl: document.getElementById('final-transcript'),
  interimTranscriptEl: document.getElementById('interim-transcript'),
  transcriptBox: document.getElementById('transcript-box'),
  wordCountEl: document.getElementById('word-count'),

  exportPdfBtn: document.getElementById('export-pdf-btn'),
  restartTestBtn: document.getElementById('restart-test-btn'),
  resultsErrorWrap: document.getElementById('results-error-wrap'),
  resultsError: document.getElementById('results-error'),
  retryGradeBtn: document.getElementById('retry-grade-btn'),
  resultsElementsMeta: document.getElementById('results-elements-meta'),
  scoreValue: document.getElementById('score-value'),
  scoreElements: document.getElementById('score-elements'),
  scoreBreakdown: document.getElementById('score-breakdown'),
  feedbackText: document.getElementById('feedback-text'),
  grammarMistakesSection: document.getElementById('grammar-mistakes-section'),
  grammarMistakesList: document.getElementById('grammar-mistakes-list'),

  resultOriginalTitle: document.getElementById('result-original-title'),
  resultOriginalImage: document.getElementById('result-original-image'),
  resultOriginalFallback: document.getElementById('result-original-fallback'),
  listenSceneBtn: document.getElementById('listen-scene-btn'),
  listenBtnLabel: document.getElementById('listen-btn-label'),
  listenSceneStatus: document.getElementById('listen-scene-status'),
  studentImageStatus: document.getElementById('student-image-status'),
  studentImageLoading: document.getElementById('student-image-loading'),
  studentLoadingLabel: document.getElementById('student-loading-label'),
  resultStudentImage: document.getElementById('result-student-image'),
  studentImageFallback: document.getElementById('student-image-fallback'),
  studentFallbackTitle: document.getElementById('student-fallback-title'),
  studentFallbackCopy: document.getElementById('student-fallback-copy'),
  resultTranscriptText: document.getElementById('result-transcript-text'),
  resultStudentKeywords: document.getElementById('result-student-keywords'),
  resultSceneKeywords: document.getElementById('result-scene-keywords'),
  resultReferenceList: document.getElementById('result-reference-list'),

  formsBackBtn: document.getElementById('forms-back-btn'),
  formsAuthPrompt: document.getElementById('forms-auth-prompt'),
  formsPanelSigninBtn: document.getElementById('forms-panel-signin-btn'),
  formsWorkspaceContent: document.getElementById('forms-workspace-content'),
  formsError: document.getElementById('forms-error'),
  formsStatus: document.getElementById('forms-status'),
  refreshSubmissionsBtn: document.getElementById('refresh-submissions-btn'),
  submissionsList: document.getElementById('submissions-list'),
  refreshFormsBtn: document.getElementById('refresh-forms-btn'),
  createPracticeFormBtn: document.getElementById('create-practice-form-btn'),
  formsList: document.getElementById('forms-list'),
  formDetailCount: document.getElementById('form-detail-count'),
  formDetailEmpty: document.getElementById('form-detail-empty'),
  formDetailBody: document.getElementById('form-detail-body'),
  formDetailTitle: document.getElementById('form-detail-title'),
  formOpenLink: document.getElementById('form-open-link'),
  formEditLink: document.getElementById('form-edit-link'),
  formItemsList: document.getElementById('form-items-list'),
  formResponsesList: document.getElementById('form-responses-list'),

  confirmModal: document.getElementById('confirm-modal'),
  confirmModalTitle: document.getElementById('confirm-modal-title'),
  confirmModalBody: document.getElementById('confirm-modal-body'),
  confirmModalCancel: document.getElementById('confirm-modal-cancel'),
  confirmModalOk: document.getElementById('confirm-modal-ok'),
};

function showScreen(screenName) {
  if (screenName === 'forms' && state.currentScreen !== 'forms') {
    state.previousScreen = state.currentScreen === 'test' ? 'home' : state.currentScreen;
  }
  state.currentScreen = screenName;
  dom.homeScreen.classList.toggle('hidden', screenName !== 'home');
  dom.testScreen.classList.toggle('hidden', screenName !== 'test');
  dom.resultsScreen.classList.toggle('hidden', screenName !== 'results');
  if (dom.formsScreen) {
    dom.formsScreen.classList.toggle('hidden', screenName !== 'forms');
  }
}

function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function hideError(element) {
  element.textContent = '';
  element.classList.add('hidden');
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getDeviceSceneCounts() {
  try {
    const raw = window.localStorage.getItem(DEVICE_SCENE_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function recordDeviceSceneUse(sceneId) {
  if (!sceneId) return;
  try {
    const counts = getDeviceSceneCounts();
    counts[sceneId] = (Number(counts[sceneId]) || 0) + 1;
    window.localStorage.setItem(DEVICE_SCENE_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function setMicState(mode, label) {
  dom.micStatus.classList.remove('mic-idle', 'mic-listening', 'mic-error');
  dom.micStatus.classList.add(`mic-${mode}`);
  dom.micStatusLabel.textContent = label;
}

function updateTranscriptDisplay() {
  const previewTail = `${state.nativeBackupBuffer} ${state.interimTranscript}`.trim();
  const combined = `${state.finalTranscript} ${previewTail}`.trim();
  const hasText = combined.length > 0;

  dom.transcriptPlaceholder.classList.toggle('hidden', hasText);
  dom.finalTranscriptEl.textContent = state.finalTranscript;
  dom.interimTranscriptEl.textContent = previewTail ? ` ${previewTail}` : '';

  const wordCount = combined ? combined.split(/\s+/).filter(Boolean).length : 0;
  dom.wordCountEl.textContent = String(wordCount);
  dom.transcriptBox.scrollTop = dom.transcriptBox.scrollHeight;
}

function appendTranscriptText(newSegment) {
  const clean = String(newSegment || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;

  const existing = state.finalTranscript.trim();
  if (!existing) {
    state.finalTranscript = clean;
    updateTranscriptDisplay();
    return;
  }

  const normalizeWord = (w) => w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
  const existingWords = existing.split(/\s+/);
  const newWords = clean.split(/\s+/);

  // If the exact phrase just appeared at the tail (e.g. mobile SpeechRecognition repeat), skip duplicating
  if (newWords.length <= existingWords.length) {
    const tailNorm = existingWords.slice(-newWords.length).map(normalizeWord).join(' ');
    const newNorm = newWords.map(normalizeWord).join(' ');
    if (newNorm && tailNorm === newNorm) {
      return;
    }
  }

  // Deduplicate 1-4 word boundary overlap without ever deleting any existing words
  const maxOverlap = Math.min(4, existingWords.length, newWords.length);
  let overlapCount = 0;
  for (let len = maxOverlap; len >= 1; len -= 1) {
    const tailSlice = existingWords.slice(-len).map(normalizeWord).join(' ');
    const headSlice = newWords.slice(0, len).map(normalizeWord).join(' ');
    if (tailSlice && tailSlice === headSlice) {
      overlapCount = len;
      break;
    }
  }

  const remainder = newWords.slice(overlapCount).join(' ').trim();
  if (!remainder) return;

  state.finalTranscript = `${existing} ${remainder}`.trim();
  updateTranscriptDisplay();
}

function commitInterimTranscript() {
  const pending = `${state.nativeBackupBuffer} ${state.interimTranscript}`.trim();
  state.nativeBackupBuffer = '';
  state.interimTranscript = '';
  if (pending) {
    appendTranscriptText(pending);
  } else {
    updateTranscriptDisplay();
  }
}

async function fetchQuestionScene() {
  const deviceCounts = getDeviceSceneCounts();
  const response = await fetch('/api/scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      excludeId: state.lastSceneId,
      deviceCounts,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Scene loading failed (${response.status}).`);
  }

  if (!data?.imageUrl || !data?.description) {
    throw new Error('Server returned an incomplete scene.');
  }

  return data;
}

async function gradeTranscript(sceneId, originalScene, studentTranscript) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId, originalScene, studentTranscript }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Grading request failed (${response.status}).`);
    }

    return data;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Grading timed out due to slow network. Please click Retry Grading.');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function startCountdownTimer() {
  if (state.timerStarted || !state.isTesting) return;
  state.timerStarted = true;
  state.remainingSeconds = TEST_DURATION_SECONDS;

  dom.timerDisplay.textContent = formatTime(state.remainingSeconds);
  dom.timerDisplay.classList.remove('timer-warning');
  dom.timerProgress.style.transform = 'scaleX(1)';

  state.timerInterval = window.setInterval(() => {
    if (!state.isTesting) return;

    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
    dom.timerDisplay.textContent = formatTime(state.remainingSeconds);

    const ratio = state.remainingSeconds / TEST_DURATION_SECONDS;
    dom.timerProgress.style.transform = `scaleX(${ratio})`;

    if (state.remainingSeconds <= 20) {
      dom.timerDisplay.classList.add('timer-warning');
    }

    if (state.remainingSeconds <= 0) {
      finishTest();
    }
  }, 1000);
}

function ensureAudioContext() {
  const AudioCtx = window.AudioContext || window['webkitAudioContext'];
  if (!AudioCtx) return null;
  try {
    if (!state.audioContext || state.audioContext.state === 'closed') {
      state.audioContext = new AudioCtx();
    }
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume().catch(() => {});
    }
    return state.audioContext;
  } catch {
    return null;
  }
}

function downsampleTo16kInt16(float32Buffer, inputSampleRate) {
  const targetRate = 16000;
  if (!float32Buffer || float32Buffer.length === 0) {
    return new Int16Array(0);
  }
  if (inputSampleRate === targetRate) {
    const out = new Int16Array(float32Buffer.length);
    for (let i = 0; i < float32Buffer.length; i += 1) {
      const s = Math.max(-1, Math.min(1, float32Buffer[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ratio = inputSampleRate / targetRate;
  const outputLength = Math.max(1, Math.floor(float32Buffer.length / ratio));
  const out = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(float32Buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += float32Buffer[j];
      count += 1;
    }
    const sample = count > 0 ? sum / count : float32Buffer[start] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

function encodeWavBlob(int16Chunks, sampleRate = 16000) {
  let totalSamples = 0;
  for (const chunk of int16Chunks) {
    totalSamples += chunk.length;
  }

  const dataByteLength = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (const chunk of int16Chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      view.setInt16(offset, chunk[i], true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function resetPcmSegmentBuffer() {
  state.pcmPreRollChunks = [];
  state.currentSegmentChunks = [];
  state.currentSegmentSamples = 0;
  state.segmentHasSpeech = false;
  state.segmentSilenceMs = 0;
}

function flushCurrentPcmSegment(forceFlush = false) {
  const minSamples = forceFlush ? 16000 * 0.3 : 16000 * 0.5;
  if (!state.segmentHasSpeech || state.currentSegmentSamples < minSamples) {
    resetPcmSegmentBuffer();
    return;
  }

  const chunks = state.currentSegmentChunks.slice();
  const backupNativeText = state.nativeBackupBuffer.trim();
  state.nativeBackupBuffer = '';
  resetPcmSegmentBuffer();

  const wavBlob = encodeWavBlob(chunks, 16000);
  if (wavBlob.size < 2000) {
    if (backupNativeText) {
      appendTranscriptText(backupNativeText);
    }
    return;
  }

  const gen = state.sessionGeneration;
  state.pendingTranscribeCount += 1;
  if (state.isTesting) {
    setMicState('listening', 'Listening — updating transcript...');
  }

  state.transcribeQueue = state.transcribeQueue
    .then(async () => {
      if (state.sessionGeneration !== gen) return;
      const previousContext = state.finalTranscript.trim().slice(-180);
      let text = '';
      try {
        text = await transcribeRecordedAudio(wavBlob, 'audio/wav', previousContext);
      } catch {
        // Quick single retry for transient network hiccups
        if (state.sessionGeneration === gen) {
          try {
            text = await transcribeRecordedAudio(wavBlob, 'audio/wav', previousContext);
          } catch {
            text = '';
          }
        }
      }

      if (state.sessionGeneration !== gen) return;
      const chosenSegment = text || backupNativeText;
      if (chosenSegment) {
        if (text) {
          state.pcmProducedTranscript = true;
        }
        appendTranscriptText(chosenSegment);
        if (state.currentScreen === 'results') {
          dom.resultTranscriptText.textContent = state.finalTranscript;
        }
      } else {
        updateTranscriptDisplay();
      }
    })
    .finally(() => {
      state.pendingTranscribeCount = Math.max(0, state.pendingTranscribeCount - 1);
      if (
        state.sessionGeneration === gen &&
        state.isTesting &&
        state.pendingTranscribeCount === 0 &&
        state.isAudioRecording
      ) {
        setMicState('listening', 'Listening — speak clearly');
      }
    });
}

function stopAudioMeterAndStreams() {
  state.pcmCaptureEnabled = false;
  if (state.meterRafId !== null) {
    window.cancelAnimationFrame(state.meterRafId);
    state.meterRafId = null;
  }
  if (dom.micLevelBar) {
    dom.micLevelBar.style.transform = 'scaleX(0)';
  }
  if (state.pcmProcessor) {
    state.pcmProcessor.onaudioprocess = null;
    try {
      state.pcmProcessor.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    state.pcmProcessor = null;
  }
  if (state.pcmSilentGain) {
    try {
      state.pcmSilentGain.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    state.pcmSilentGain = null;
  }
  if (state.pcmSource) {
    try {
      state.pcmSource.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    state.pcmSource = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
  if (state.audioContext) {
    const ctx = state.audioContext;
    state.audioContext = null;
    state.analyserNode = null;
    if (ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
  resetPcmSegmentBuffer();
  state.isAudioRecording = false;
}

function abortAudioCapture() {
  if (state.mediaRecorder) {
    const recorder = state.mediaRecorder;
    state.mediaRecorder = null;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors during abort
      }
    }
  }
  state.recordedChunks = [];
  stopAudioMeterAndStreams();
}

async function populateMicDevices(activeStream) {
  if (!dom.micDeviceSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    const activeTrack = activeStream ? activeStream.getAudioTracks()[0] : null;
    const activeSettings = activeTrack && activeTrack.getSettings ? activeTrack.getSettings() : {};
    const activeDeviceId = state.selectedDeviceId || activeSettings.deviceId || '';

    dom.micDeviceSelect.textContent = '';
    audioInputs.forEach((device, idx) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.textContent = device.label || `Microphone ${idx + 1}`;
      if (device.deviceId === activeDeviceId) {
        opt.selected = true;
      }
      dom.micDeviceSelect.appendChild(opt);
    });

    dom.micDeviceSelect.classList.toggle('hidden', audioInputs.length <= 1);
  } catch {
    // Ignore enumerateDevices failures in restricted contexts
  }
}

function startAudioMeterAndPcm(stream) {
  const audioContext = ensureAudioContext();
  if (!audioContext) return false;

  try {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    state.pcmSource = source;
    state.analyserNode = analyser;

    if (typeof audioContext.createScriptProcessor === 'function') {
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      state.pcmProcessor = processor;
      state.pcmSilentGain = silentGain;
      state.pcmCaptureEnabled = true;

      const sampleRate = audioContext.sampleRate || 48000;
      const chunkDurationMs = (4096 / sampleRate) * 1000;

      processor.onaudioprocess = (event) => {
        if (!state.isTesting || !state.pcmCaptureEnabled) return;

        const inputData = event.inputBuffer.getChannelData(0);
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i += 1) {
          const s = inputData[i];
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        const int16Chunk = downsampleTo16kInt16(inputData, sampleRate);
        if (int16Chunk.length === 0) return;

        // Adaptive noise floor so quiet laptop/phone microphones still capture soft consonants
        if (!state.segmentHasSpeech) {
          state.noiseFloor = state.noiseFloor * 0.92 + Math.min(rms, 0.02) * 0.08;
        }
        const speechThreshold = Math.max(0.0045, Math.min(0.016, state.noiseFloor * 2.2));
        const isSpeechFrame = rms > speechThreshold;

        if (!state.segmentHasSpeech) {
          state.pcmPreRollChunks.push(int16Chunk);
          if (state.pcmPreRollChunks.length > 5) {
            state.pcmPreRollChunks.shift();
          }
          if (isSpeechFrame) {
            state.segmentHasSpeech = true;
            state.segmentSilenceMs = 0;
            state.currentSegmentChunks = state.pcmPreRollChunks.slice();
            state.currentSegmentSamples = state.currentSegmentChunks.reduce(
              (acc, c) => acc + c.length,
              0
            );
            state.pcmPreRollChunks = [];
          }
          return;
        }

        state.currentSegmentChunks.push(int16Chunk);
        state.currentSegmentSamples += int16Chunk.length;

        if (isSpeechFrame) {
          state.segmentSilenceMs = 0;
        } else {
          state.segmentSilenceMs += chunkDurationMs;
        }

        const reachedNaturalPause =
          state.currentSegmentSamples >= 16000 * 0.9 && state.segmentSilenceMs >= 500;
        const reachedSoftGapSplit =
          state.currentSegmentSamples >= 16000 * 3.8 && rms < speechThreshold * 1.25;
        const reachedMaxLength = state.currentSegmentSamples >= 16000 * 6.0;

        if (reachedNaturalPause || reachedSoftGapSplit || reachedMaxLength) {
          flushCurrentPcmSegment(false);
        }
      };
    }

    if (dom.micLevelBar) {
      const dataArray = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!state.isTesting || !state.analyserNode || !dom.micLevelBar) {
          return;
        }
        state.analyserNode.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const level = Math.min(1, Math.max(0, rms * 4.5));
        dom.micLevelBar.style.transform = `scaleX(${level.toFixed(3)})`;
        state.meterRafId = window.requestAnimationFrame(tick);
      };
      state.meterRafId = window.requestAnimationFrame(tick);
    }

    return true;
  } catch {
    return false;
  }
}

async function startAudioCapture(deviceId = '') {
  if (state.isTesting) {
    flushCurrentPcmSegment(true);
  }
  abortAudioCapture();
  ensureAudioContext();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (
      state.hasFatalSpeechError ||
      IS_MOBILE_BROWSER ||
      !(window.SpeechRecognition || window['webkitSpeechRecognition'])
    ) {
      setMicState('error', 'Microphone unsupported');
      showError(
        dom.speechWarning,
        'Microphone capture is not available in this browser or preview frame. Open the app in Chrome, Safari, or Edge over HTTPS.'
      );
    }
    return { ok: false, error: 'unsupported' };
  }

  let stream = null;
  try {
    const audioOpts = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId }, ...audioOpts } }
      : { audio: audioOpts };
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  } catch (err) {
    state.isAudioRecording = false;
    const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
    let message =
      'Could not access your microphone. Please check browser permissions and click Restart Mic.';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      message =
        'Microphone access was blocked by browser permissions. Allow microphone access in the address bar and click Restart Mic.';
    } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      message =
        'No microphone device was detected. Connect a microphone and click Restart Mic.';
    }
    setMicState('error', 'Microphone blocked');
    showError(dom.speechWarning, message);
    return { ok: false, error: errName || 'permission-error' };
  }

  if (!state.isTesting) {
    stream.getTracks().forEach((track) => track.stop());
    return { ok: false, error: 'cancelled' };
  }

  state.mediaStream = stream;
  await populateMicDevices(stream);
  const pcmActive = startAudioMeterAndPcm(stream);

  const preferredMimes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  const supportedMime =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? preferredMimes.find((mime) => MediaRecorder.isTypeSupported(mime)) || ''
      : '';

  if (typeof MediaRecorder !== 'undefined') {
    try {
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
      state.recordedChunks = [];
      state.recordedMimeType = recorder.mimeType || supportedMime || 'audio/webm';
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          state.recordedChunks.push(event.data);
        }
      };
      recorder.start(1000);
      state.mediaRecorder = recorder;
      state.isAudioRecording = true;
    } catch {
      state.isAudioRecording = pcmActive;
    }
  } else {
    state.isAudioRecording = pcmActive;
  }

  if (state.isAudioRecording) {
    hideError(dom.speechWarning);
    const useAiLabel =
      IS_MOBILE_BROWSER ||
      state.hasFatalSpeechError ||
      !(window.SpeechRecognition || window['webkitSpeechRecognition']);
    if (useAiLabel) {
      setMicState('listening', 'Listening (Live voice capture)');
      dom.transcriptPlaceholder.textContent =
        'Speak clearly once the scene appears — your sentences appear live as you speak.';
    } else if (!state.finalTranscript && !state.interimTranscript) {
      setMicState('listening', 'Mic active — speak now');
    }
  }

  return { ok: true };
}

function stopAudioCaptureAndGetBlob() {
  return new Promise((resolve) => {
    const recorder = state.mediaRecorder;
    const mimeType = state.recordedMimeType || 'audio/webm';

    if (!recorder) {
      stopAudioMeterAndStreams();
      resolve({ blob: null, mimeType });
      return;
    }

    const finalize = () => {
      const chunks = state.recordedChunks.slice();
      state.recordedChunks = [];
      state.mediaRecorder = null;
      stopAudioMeterAndStreams();
      const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
      resolve({ blob, mimeType });
    };

    if (recorder.state === 'inactive') {
      finalize();
      return;
    }

    let settled = false;
    const safetyTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        finalize();
      }
    }, 450);

    recorder.onstop = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(safetyTimer);
        finalize();
      }
    };

    try {
      recorder.stop();
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(safetyTimer);
        finalize();
      }
    }
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Failed to encode audio recording.'));
        return;
      }
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read audio recording.'));
    reader.readAsDataURL(blob);
  });
}

async function transcribeRecordedAudio(blob, mimeType, previousText = '') {
  const audioBase64 = await blobToBase64(blob);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType, previousText }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Audio transcription failed (${response.status}).`);
    }
    return typeof data?.transcript === 'string' ? data.transcript.trim() : '';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Audio transcription timed out. Please try again.');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function startSpeechRecognition() {
  if (IS_MOBILE_BROWSER) {
    // Mobile browsers suffer hardware mic contention and duplicate/vanishing SpeechRecognition results when recording simultaneously
    state.hasFatalSpeechError = true;
    return;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window['webkitSpeechRecognition'];

  if (!SpeechRecognitionCtor) {
    state.hasFatalSpeechError = true;
    if (state.isAudioRecording) {
      hideError(dom.speechWarning);
      setMicState('listening', 'Listening (Live voice capture)');
      dom.transcriptPlaceholder.textContent =
        'Speak clearly once the scene appears — your sentences appear live as you speak.';
    } else {
      setMicState('idle', 'Starting audio recorder...');
    }
    return;
  }

  stopSpeechRecognition();
  state.hasFatalSpeechError = false;
  hideError(dom.speechWarning);

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    if (state.isTesting && !state.hasFatalSpeechError) {
      setMicState('listening', 'Listening');
    }
  };

  recognition.onaudiostart = () => {
    if (state.isTesting && !state.hasFatalSpeechError) {
      setMicState('listening', 'Mic active — speak now');
    }
  };

  recognition.onspeechstart = () => {
    if (state.isTesting && !state.hasFatalSpeechError) {
      setMicState('listening', 'Hearing speech...');
    }
  };

  recognition.onresult = (event) => {
    state.hasFatalSpeechError = false;
    state.hasNativeSpeechResult = true;
    state.lastLiveSpeechResultAt = Date.now();
    hideError(dom.speechWarning);
    if (state.pendingTranscribeCount === 0) {
      setMicState('listening', 'Listening');
    }

    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcriptPiece = (result[0]?.transcript || '').trim();
      if (!transcriptPiece) continue;
      if (result.isFinal) {
        // Hold as live preview backup until the high-accuracy 16kHz WAV segment commits (or use directly if no PCM segment active)
        if (state.pcmCaptureEnabled) {
          state.nativeBackupBuffer = `${state.nativeBackupBuffer} ${transcriptPiece}`.trim();
        } else {
          appendTranscriptText(transcriptPiece);
        }
      } else {
        interim += ` ${transcriptPiece}`;
      }
    }
    state.interimTranscript = interim.trim();
    updateTranscriptDisplay();
  };

  recognition.onerror = (event) => {
    if (!state.isTesting) return;

    if (
      state.isAudioRecording &&
      (event.error === 'network' ||
        event.error === 'service-not-allowed' ||
        event.error === 'language-not-supported' ||
        event.error === 'not-allowed' ||
        event.error === 'audio-capture')
    ) {
      state.hasFatalSpeechError = true;
      hideError(dom.speechWarning);
      setMicState('listening', 'Listening (Live voice capture)');
      dom.transcriptPlaceholder.textContent =
        'Speak clearly once the scene appears — your sentences appear live as you speak.';
      return;
    }

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      state.hasFatalSpeechError = true;
      setMicState('error', 'Microphone blocked');
      showError(
        dom.speechWarning,
        'Microphone access was denied or blocked by browser permissions. Allow microphone access in the address bar and click Restart Mic.'
      );
    } else if (event.error === 'audio-capture') {
      state.hasFatalSpeechError = true;
      setMicState('error', 'No microphone found');
      showError(
        dom.speechWarning,
        'No active microphone input was detected. Check your system input device and click Restart Mic.'
      );
    } else if (event.error === 'network') {
      state.hasFatalSpeechError = true;
      if (state.isAudioRecording) {
        setMicState('listening', 'Listening (Live voice capture)');
      } else {
        setMicState('error', 'Speech network error');
        showError(
          dom.speechWarning,
          'Live speech recognition could not connect. Allow microphone access for AI voice recording and click Restart Mic.'
        );
      }
    } else if (event.error === 'language-not-supported') {
      state.hasFatalSpeechError = true;
      setMicState('error', 'Language unsupported');
      showError(dom.speechWarning, 'English (en-US) speech recognition is not supported on this device.');
    } else if (event.error === 'no-speech') {
      if (!state.hasFatalSpeechError) {
        setMicState('listening', 'Listening — speak louder');
      }
    } else if (event.error !== 'aborted') {
      setMicState('error', `Voice error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    if (state.interimTranscript) {
      if (state.pcmCaptureEnabled) {
        state.nativeBackupBuffer = `${state.nativeBackupBuffer} ${state.interimTranscript}`.trim();
        state.interimTranscript = '';
        updateTranscriptDisplay();
      } else {
        commitInterimTranscript();
      }
    }

    if (state.isTesting && !state.hasFatalSpeechError && state.recognition === recognition) {
      window.setTimeout(() => {
        if (!state.isTesting || state.hasFatalSpeechError || state.recognition !== recognition) {
          return;
        }
        startSpeechRecognition();
      }, 200);
    }
  };

  state.recognition = recognition;
  try {
    recognition.start();
  } catch (_err) {
    if (state.isAudioRecording) {
      setMicState('listening', 'Listening (Live voice capture)');
    } else {
      setMicState('error', 'Unable to start mic');
      showError(dom.speechWarning, 'Could not start speech capture. Click Restart Mic to try again.');
    }
  }
}

function stopSpeechRecognition() {
  if (state.recognition) {
    const activeRecognition = state.recognition;
    state.recognition = null;
    activeRecognition.onend = null;
    activeRecognition.onerror = null;
    activeRecognition.onresult = null;
    try {
      activeRecognition.stop();
    } catch (_err) {
      // Recognition already stopped
    }
  }
}

function cleanupTimers() {
  if (state.timerInterval !== null) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  if (state.imageFallbackTimer !== null) {
    window.clearTimeout(state.imageFallbackTimer);
    state.imageFallbackTimer = null;
  }
}

function resetTestView() {
  state.sessionGeneration += 1;
  cleanupTimers();
  stopSpeechRecognition();
  abortAudioCapture();

  state.sceneId = '';
  state.sceneTitle = '';
  state.sceneKeywords = [];
  state.sceneElements = [];
  state.sceneDescription = '';
  state.questionImageUrl = '';
  state.finalTranscript = '';
  state.interimTranscript = '';
  state.lastResult = null;
  state.remainingSeconds = TEST_DURATION_SECONDS;
  state.isTesting = false;
  state.timerStarted = false;
  state.hasFatalSpeechError = false;
  state.hasNativeSpeechResult = false;
  state.lastLiveSpeechResultAt = 0;
  state.nativeBackupBuffer = '';
  state.noiseFloor = 0.004;
  state.pendingTranscribeCount = 0;
  state.transcribeQueue = Promise.resolve();
  state.pcmProducedTranscript = false;
  resetPcmSegmentBuffer();

  hideError(dom.testError);
  hideError(dom.speechWarning);

  dom.timerDisplay.textContent = formatTime(TEST_DURATION_SECONDS);
  dom.timerDisplay.classList.remove('timer-warning');
  dom.timerProgress.style.transform = 'scaleX(1)';
  dom.finishEarlyBtn.disabled = false;

  dom.sceneStatusText.textContent = 'Loading scene...';
  dom.questionLoadingLabel.textContent = 'Loading scene photograph...';
  dom.questionImageLoading.classList.remove('hidden');
  dom.questionImage.classList.add('hidden');
  dom.questionImage.removeAttribute('src');
  dom.questionImageFallback.classList.add('hidden');

  dom.transcriptPlaceholder.textContent =
    'Start speaking clearly once the scene appears. Your voice is captured live.';
  if (dom.micDeviceSelect) {
    dom.micDeviceSelect.classList.add('hidden');
    dom.micDeviceSelect.textContent = '';
  }

  stopSceneAudio();
  setMicState('idle', 'Waiting for microphone');
  updateTranscriptDisplay();
}

function setListenButtonState(mode, labelText) {
  if (dom.listenBtnLabel) {
    dom.listenBtnLabel.textContent = labelText;
  } else if (dom.listenSceneBtn) {
    dom.listenSceneBtn.textContent = labelText;
  }
  if (dom.listenSceneBtn) {
    dom.listenSceneBtn.classList.toggle('is-loading', mode === 'loading');
    dom.listenSceneBtn.classList.toggle('is-playing', mode === 'playing');
  }
}

function stopSceneAudio() {
  state.isSceneAudioLoading = false;
  state.isSceneAudioPlaying = false;
  if (state.sceneAudio) {
    try {
      state.sceneAudio.pause();
      state.sceneAudio.currentTime = 0;
    } catch {
      // Ignore audio element stop errors
    }
    state.sceneAudio = null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore speechSynthesis cancel errors
    }
  }
  if (dom.listenSceneBtn) {
    dom.listenSceneBtn.disabled = false;
  }
  setListenButtonState('idle', 'Listen to Description');
  if (dom.listenSceneStatus) {
    dom.listenSceneStatus.textContent = 'Random male or female voice';
  }
}

function speakWithBrowserFallback(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('Voice playback is unavailable in this browser.');
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang && v.lang.startsWith('en'));
  const targetGender = Math.random() < 0.5 ? 'male' : 'female';
  let chosenLabel = targetGender === 'male' ? 'Male voice' : 'Female voice';

  if (voices.length > 0) {
    const maleHints = /(david|mark|george|daniel|james|alex|guy|andrew|male)/i;
    const femaleHints = /(zira|samantha|victoria|karen|hazel|susan|aria|jenny|female)/i;
    const matchedPool = voices.filter((v) =>
      targetGender === 'male' ? maleHints.test(v.name) : femaleHints.test(v.name)
    );
    const pool = matchedPool.length > 0 ? matchedPool : voices;
    const chosenVoice = pool[Math.floor(Math.random() * pool.length)];
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      if (matchedPool.length === 0) {
        chosenLabel = 'English voice';
      }
    }
  }

  state.isSceneAudioPlaying = true;
  if (dom.listenSceneBtn) {
    dom.listenSceneBtn.disabled = false;
  }
  setListenButtonState('playing', 'Stop Voice');
  if (dom.listenSceneStatus) {
    dom.listenSceneStatus.textContent = `Playing (${chosenLabel})`;
  }

  utterance.onend = () => {
    if (state.isSceneAudioPlaying) {
      stopSceneAudio();
    }
  };
  utterance.onerror = () => {
    if (state.isSceneAudioPlaying) {
      stopSceneAudio();
    }
  };

  window.speechSynthesis.speak(utterance);
}

async function toggleSceneAudioDescription() {
  if (state.isSceneAudioPlaying || state.isSceneAudioLoading) {
    stopSceneAudio();
    return;
  }

  const descriptionText =
    state.sceneElements.length > 0 ? state.sceneElements.join(' ') : state.sceneDescription;
  if (!descriptionText) return;

  state.isSceneAudioLoading = true;
  if (dom.listenSceneBtn) {
    dom.listenSceneBtn.disabled = true;
  }
  setListenButtonState('loading', 'Loading voice...');
  if (dom.listenSceneStatus) {
    dom.listenSceneStatus.textContent = 'Generating voice description...';
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 18000);
    let data = {};
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: descriptionText, sceneId: state.sceneId }),
        signal: controller.signal,
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.audioBase64) {
        throw new Error(data?.error || 'TTS failed');
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!state.isSceneAudioLoading) {
      return;
    }

    const mime = data.mimeType || 'audio/wav';
    const audio = new Audio(`data:${mime};base64,${data.audioBase64}`);
    state.sceneAudio = audio;
    state.isSceneAudioLoading = false;
    state.isSceneAudioPlaying = true;

    const genderLabel = data.voiceGender === 'male' ? 'Male voice' : 'Female voice';
    if (dom.listenSceneBtn) {
      dom.listenSceneBtn.disabled = false;
    }
    setListenButtonState('playing', 'Stop Voice');
    if (dom.listenSceneStatus) {
      dom.listenSceneStatus.textContent = `Playing (${genderLabel})`;
    }

    audio.onended = () => {
      if (state.sceneAudio === audio) {
        stopSceneAudio();
      }
    };
    audio.onerror = () => {
      if (state.sceneAudio === audio) {
        stopSceneAudio();
      }
    };

    await audio.play();
  } catch {
    if (!state.isSceneAudioLoading) {
      return;
    }
    state.isSceneAudioLoading = false;
    try {
      speakWithBrowserFallback(descriptionText);
    } catch {
      stopSceneAudio();
      if (dom.listenSceneStatus) {
        dom.listenSceneStatus.textContent = 'Voice playback unavailable';
      }
    }
  }
}

function renderGrammarMistakes(mistakes) {
  dom.grammarMistakesList.textContent = '';

  if (!Array.isArray(mistakes) || mistakes.length === 0) {
    dom.grammarMistakesSection.classList.remove('hidden');
    const li = document.createElement('li');
    li.className = 'grammar-item';
    li.textContent = 'No grammatical or sentence mistakes detected (0% deducted).';
    dom.grammarMistakesList.appendChild(li);
    return;
  }

  dom.grammarMistakesSection.classList.remove('hidden');
  mistakes.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'grammar-item';

    const wrongSpan = document.createElement('span');
    wrongSpan.className = 'grammar-mistake';
    wrongSpan.textContent = item.mistake;

    const arrowText = document.createTextNode(' -> ');

    const fixSpan = document.createElement('span');
    fixSpan.className = 'grammar-correction';
    fixSpan.textContent = item.correction;

    const noteSpan = document.createElement('span');
    noteSpan.className = 'grammar-note';
    noteSpan.textContent = ` (${item.explanation})`;

    li.appendChild(wrongSpan);
    li.appendChild(arrowText);
    li.appendChild(fixSpan);
    li.appendChild(noteSpan);
    dom.grammarMistakesList.appendChild(li);
  });
}

function renderReferenceDetails() {
  dom.resultSceneKeywords.textContent =
    state.sceneKeywords.length > 0 ? `Keypoints: ${state.sceneKeywords.join(' · ')}` : '';

  dom.resultReferenceList.textContent = '';
  const items = state.sceneElements.length > 0 ? state.sceneElements : [state.sceneDescription];
  items.forEach((sentence) => {
    if (!sentence) return;
    const li = document.createElement('li');
    li.textContent = sentence;
    dom.resultReferenceList.appendChild(li);
  });
}

async function renderStudentImageFromPrompt(promptText, keywords = []) {
  dom.studentImageStatus.textContent = 'Creating answer picture...';
  dom.studentLoadingLabel.textContent = 'Generating scene from your spoken keywords...';
  dom.studentImageLoading.classList.remove('hidden');
  dom.resultStudentImage.classList.add('hidden');
  dom.studentImageFallback.classList.add('hidden');

  try {
    const response = await fetch('/api/student-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, keywords, excludeSceneId: state.sceneId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.imageUrl) {
      throw new Error(data?.error || 'Could not load answer image.');
    }

    dom.resultStudentImage.onload = () => {
      dom.studentImageLoading.classList.add('hidden');
      dom.studentImageFallback.classList.add('hidden');
      dom.resultStudentImage.classList.remove('hidden');
      dom.studentImageStatus.textContent =
        data.source === 'web-search'
          ? 'Matched from web keywords'
          : 'Generated from your speech';
    };

    dom.resultStudentImage.onerror = () => {
      dom.studentImageLoading.classList.add('hidden');
      dom.resultStudentImage.classList.add('hidden');
      dom.studentFallbackTitle.textContent = 'Student image unavailable';
      dom.studentFallbackCopy.textContent =
        'No matching picture could be loaded right now. Your score and feedback are ready above.';
      dom.studentImageFallback.classList.remove('hidden');
      dom.studentImageStatus.textContent = 'Image load failed';
    };

    dom.resultStudentImage.src = data.imageUrl;
  } catch (_err) {
    dom.studentImageLoading.classList.add('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentFallbackTitle.textContent = 'Student image unavailable';
    dom.studentFallbackCopy.textContent =
      'No matching picture could be loaded right now. Your score and feedback are ready above.';
    dom.studentImageFallback.classList.remove('hidden');
    dom.studentImageStatus.textContent = 'Image load failed';
  }
}

function imageElementToJpegDataUrl(imgEl) {
  if (!imgEl || imgEl.classList.contains('hidden') || !imgEl.complete || imgEl.naturalWidth === 0) {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

function buildTranscriptPdfDoc({
  sceneTitle,
  dateLabel,
  scoreText,
  elementsText,
  breakdownText,
  origDataUrl,
  studentDataUrl,
  feedbackText,
  grammarMistakes,
  spokenTranscript,
  keywords,
  elements,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (neededMm) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  const writeWrappedText = (text, fontSize, colorRgb, lineHeight = 5.5) => {
    doc.setFontSize(fontSize);
    doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    const lines = doc.splitTextToSize(String(text || ''), contentWidth);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, margin, y);
      y += lineHeight;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('SpeakScene — English Speaking Test Report', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${sceneTitle || 'Speaking Assessment'} · ${dateLabel || new Date().toLocaleDateString()}`, margin, y);
  y += 6;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Score Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235);
  doc.text(scoreText || '--%', margin + 6, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(elementsText || '', margin + 45, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  if (breakdownText) {
    doc.text(breakdownText, margin + 45, y + 17);
  }
  y += 32;

  // Images Side-by-Side
  if (origDataUrl || studentDataUrl) {
    const boxWidth = (contentWidth - 8) / 2;
    const boxHeight = (boxWidth * 3) / 4;
    ensureSpace(boxHeight + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Original Question Picture', margin, y);
    doc.text("Student's Spoken Picture", margin + boxWidth + 8, y);
    y += 4;

    if (origDataUrl) {
      doc.addImage(origDataUrl, 'JPEG', margin, y, boxWidth, boxHeight);
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, boxWidth, boxHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Image unavailable', margin + 6, y + boxHeight / 2);
    }

    if (studentDataUrl) {
      doc.addImage(studentDataUrl, 'JPEG', margin + boxWidth + 8, y, boxWidth, boxHeight);
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin + boxWidth + 8, y, boxWidth, boxHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Image unavailable', margin + boxWidth + 14, y + boxHeight / 2);
    }

    y += boxHeight + 10;
  }

  // Examiner Feedback
  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Examiner Feedback', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  writeWrappedText(feedbackText || '', 10, [51, 65, 85], 5.2);
  y += 6;

  // Grammar Mistakes
  const mistakes = Array.isArray(grammarMistakes) ? grammarMistakes : [];
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Grammar & Sentence Mistakes (-2% each)', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  if (mistakes.length === 0) {
    writeWrappedText('No grammatical or sentence mistakes detected.', 10, [51, 65, 85], 5.2);
  } else {
    mistakes.forEach((m, idx) => {
      writeWrappedText(
        `${idx + 1}. "${m.mistake}" -> "${m.correction}" (${m.explanation})`,
        9.5,
        [51, 65, 85],
        5
      );
    });
  }
  y += 6;

  // Student Spoken Transcript
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Student Spoken Transcript', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  writeWrappedText(spokenTranscript || '', 10, [51, 65, 85], 5.2);
  y += 6;

  // Reference 10 Sentences
  const refElements = Array.isArray(elements) ? elements : [];
  const refKeywords = Array.isArray(keywords) ? keywords : [];
  if (refElements.length > 0) {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Scene Keypoints & 10-Sentence Reference', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    if (refKeywords.length > 0) {
      writeWrappedText(`Keypoints: ${refKeywords.join(', ')}`, 9, [100, 116, 139], 4.8);
      y += 2;
    }
    refElements.forEach((sentence, idx) => {
      writeWrappedText(`${idx + 1}. ${sentence}`, 9.5, [51, 65, 85], 5);
    });
  }

  return doc;
}

function exportResultsPdf() {
  dom.exportPdfBtn.disabled = true;
  const originalLabel = dom.exportPdfBtn.textContent;
  dom.exportPdfBtn.textContent = 'Exporting...';

  try {
    const doc = buildTranscriptPdfDoc({
      sceneTitle: state.sceneTitle || 'Speaking Assessment',
      dateLabel: new Date().toLocaleDateString(),
      scoreText: dom.scoreValue.textContent || '--%',
      elementsText: dom.scoreElements.textContent || '',
      breakdownText: dom.scoreBreakdown.textContent || '',
      origDataUrl: imageElementToJpegDataUrl(dom.resultOriginalImage),
      studentDataUrl: imageElementToJpegDataUrl(dom.resultStudentImage),
      feedbackText: dom.feedbackText.textContent || '',
      grammarMistakes: state.lastResult?.grammarMistakes || [],
      spokenTranscript: dom.resultTranscriptText.textContent || '',
      keywords: state.sceneKeywords,
      elements: state.sceneElements,
    });

    const safeSlug = (state.sceneId || 'result').replace(/[^a-z0-9_-]/gi, '-');
    doc.save(`speakscene-${safeSlug}-report.pdf`);
  } catch (err) {
    dom.resultsError.textContent =
      err instanceof Error ? `PDF export failed: ${err.message}` : 'PDF export failed.';
    dom.resultsErrorWrap.classList.remove('hidden');
  } finally {
    dom.exportPdfBtn.textContent = originalLabel;
    dom.exportPdfBtn.disabled = false;
  }
}

async function startTest() {
  hideError(dom.homeError);
  dom.startTestBtn.disabled = true;

  resetTestView();
  showScreen('test');
  state.isTesting = true;

  // Warm up AudioContext synchronously inside user click gesture (critical for iOS/Safari & mobile Chrome)
  ensureAudioContext();
  startSpeechRecognition();
  startAudioCapture(state.selectedDeviceId);

  try {
    const sceneData = await fetchQuestionScene();
    if (!state.isTesting) return;

    state.sceneId = sceneData.sceneId || '';
    state.lastSceneId = state.sceneId;
    recordDeviceSceneUse(state.sceneId);
    state.sceneTitle = sceneData.title || 'Reference scene';
    state.sceneKeywords = Array.isArray(sceneData.keywords) ? sceneData.keywords : [];
    state.sceneElements = Array.isArray(sceneData.elements) ? sceneData.elements : [];
    state.sceneDescription = sceneData.description;
    state.questionImageUrl = sceneData.imageUrl;

    dom.questionImage.onload = () => {
      if (!state.isTesting) return;
      dom.questionImageLoading.classList.add('hidden');
      dom.questionImageFallback.classList.add('hidden');
      dom.questionImage.classList.remove('hidden');
      dom.sceneStatusText.textContent = `${state.sceneTitle} — start describing`;
      startCountdownTimer();
    };

    dom.questionImage.onerror = () => {
      if (!state.isTesting) return;
      dom.questionImageLoading.classList.add('hidden');
      dom.questionImage.classList.add('hidden');
      dom.questionImageFallback.classList.remove('hidden');
      dom.sceneStatusText.textContent = 'Image load failed';
      startCountdownTimer();
    };

    dom.questionImage.src = state.questionImageUrl;

    state.imageFallbackTimer = window.setTimeout(() => {
      if (state.isTesting && !state.timerStarted) {
        startCountdownTimer();
      }
    }, 3000);
  } catch (err) {
    state.isTesting = false;
    cleanupTimers();
    stopSpeechRecognition();
    abortAudioCapture();
    showScreen('home');
    showError(dom.homeError, err.message || 'Unable to start the speaking test.');
  } finally {
    dom.startTestBtn.disabled = false;
  }
}

async function runGradingFlow(spokenText) {
  dom.resultsErrorWrap.classList.add('hidden');
  dom.resultsError.textContent = '';
  dom.retryGradeBtn.disabled = true;

  dom.scoreValue.textContent = '--%';
  dom.scoreElements.textContent = 'Grading response...';
  dom.scoreBreakdown.textContent = '';
  dom.resultsElementsMeta.textContent = 'Evaluating keypoints & grammar';
  dom.feedbackText.textContent =
    'Analyzing your spoken description against the scene keypoints and checking grammar...';
  dom.grammarMistakesSection.classList.add('hidden');
  dom.grammarMistakesList.textContent = '';
  dom.resultStudentKeywords.classList.add('hidden');
  dom.resultStudentKeywords.textContent = '';

  dom.studentImageStatus.textContent = 'Creating answer picture...';
  dom.studentLoadingLabel.textContent = 'Extracting visual keywords from your speech...';
  dom.studentImageLoading.classList.remove('hidden');
  dom.resultStudentImage.classList.add('hidden');
  dom.studentImageFallback.classList.add('hidden');

  try {
    const result = await gradeTranscript(state.sceneId, state.sceneDescription, spokenText);
    const boundedScore = Math.max(0, Math.min(100, Math.round(Number(result.scorePercent) || 0)));
    const boundedMatched = Math.max(
      0,
      Math.min(10, Math.round(Number(result.matchedElements) || 0))
    );
    const baseScore = Math.max(0, Math.min(100, Math.round(Number(result.baseScorePercent) || 0)));
    const deduction = Math.max(0, Math.round(Number(result.deductionPercent) || 0));
    const mistakes = Array.isArray(result.grammarMistakes) ? result.grammarMistakes : [];

    state.lastResult = {
      scorePercent: boundedScore,
      baseScorePercent: baseScore,
      deductionPercent: deduction,
      matchedElements: boundedMatched,
      grammarMistakes: mistakes,
      feedback: result.feedback || 'Grading complete.',
    };

    dom.scoreValue.textContent = `${boundedScore}%`;
    dom.scoreElements.textContent = `${boundedMatched} / 10 keypoints matched`;
    dom.scoreBreakdown.textContent = `Base ${baseScore}% · -${deduction}% grammar (${mistakes.length} mistake${mistakes.length === 1 ? '' : 's'})`;
    dom.resultsElementsMeta.textContent = `${boundedMatched} of 10 keypoints · ${mistakes.length} grammar note${mistakes.length === 1 ? '' : 's'}`;
    dom.feedbackText.textContent = state.lastResult.feedback;

    renderGrammarMistakes(mistakes);

    const promptForStudentImage = result.studentImagePrompt || spokenText;
    const keywordsForStudentImage = Array.isArray(result.studentImageKeywords)
      ? result.studentImageKeywords
      : [];
    if (result.studentImagePrompt) {
      dom.resultStudentKeywords.textContent = `Extracted visual keywords: ${result.studentImagePrompt}`;
      dom.resultStudentKeywords.classList.remove('hidden');
    }

    renderStudentImageFromPrompt(promptForStudentImage, keywordsForStudentImage);
  } catch (err) {
    dom.scoreValue.textContent = 'N/A';
    dom.scoreElements.textContent = 'Grading paused';
    dom.feedbackText.textContent =
      'Grading could not finish right now, but your spoken transcript is saved. Click Retry Grading above to try again.';
    dom.resultsError.textContent = err instanceof Error ? err.message : 'Failed to grade spoken response.';
    dom.resultsErrorWrap.classList.remove('hidden');
    renderStudentImageFromPrompt(spokenText, []);
  } finally {
    dom.retryGradeBtn.disabled = false;
  }
}

async function finishTest() {
  if (!state.isTesting) return;

  const gen = state.sessionGeneration;
  state.isTesting = false;
  dom.finishEarlyBtn.disabled = true;
  cleanupTimers();
  stopSpeechRecognition();
  if (state.interimTranscript) {
    state.nativeBackupBuffer = `${state.nativeBackupBuffer} ${state.interimTranscript}`.trim();
    state.interimTranscript = '';
  }
  flushCurrentPcmSegment(true);
  if (state.nativeBackupBuffer) {
    appendTranscriptText(state.nativeBackupBuffer);
    state.nativeBackupBuffer = '';
  }
  setMicState('idle', 'Finishing recording...');

  const audioCapture = await stopAudioCaptureAndGetBlob();
  setMicState('idle', 'Recording stopped');

  showScreen('results');
  dom.resultsErrorWrap.classList.add('hidden');
  dom.resultsError.textContent = '';

  dom.resultOriginalTitle.textContent = state.sceneTitle || 'Reference scene';
  renderReferenceDetails();

  if (state.questionImageUrl) {
    dom.resultOriginalImage.classList.remove('hidden');
    dom.resultOriginalFallback.classList.add('hidden');
    dom.resultOriginalImage.onerror = () => {
      dom.resultOriginalImage.classList.add('hidden');
      dom.resultOriginalFallback.classList.remove('hidden');
    };
    dom.resultOriginalImage.src = state.questionImageUrl;
  } else {
    dom.resultOriginalImage.classList.add('hidden');
    dom.resultOriginalFallback.classList.remove('hidden');
  }

  // Always preserve everything already transcribed; never overwrite existing live sentences
  dom.resultTranscriptText.textContent =
    state.finalTranscript.trim() || 'Finalizing spoken transcript...';

  let transcriptionError = '';

  if (state.pendingTranscribeCount > 0) {
    dom.scoreValue.textContent = '--%';
    dom.scoreElements.textContent = 'Finalizing speech...';
    dom.scoreBreakdown.textContent = '';
    dom.resultsElementsMeta.textContent = 'Finalizing spoken transcript';
    dom.feedbackText.textContent = 'Finishing the last spoken words before grading...';
    dom.grammarMistakesSection.classList.add('hidden');
    dom.resultStudentKeywords.classList.add('hidden');
    dom.studentImageStatus.textContent = 'Waiting for transcript...';
    dom.studentLoadingLabel.textContent = 'Finalizing your spoken transcript...';
    dom.studentImageLoading.classList.remove('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentImageFallback.classList.add('hidden');

    await state.transcribeQueue;
    if (state.sessionGeneration !== gen) return;
  }

  // Backup: only transcribe MediaRecorder blob if live capture produced 0 words
  if (!state.finalTranscript.trim() && audioCapture.blob && audioCapture.blob.size > 1500) {
    dom.scoreValue.textContent = '--%';
    dom.scoreElements.textContent = 'Transcribing voice...';
    dom.scoreBreakdown.textContent = '';
    dom.resultsElementsMeta.textContent = 'Finalizing spoken transcript';
    dom.feedbackText.textContent = 'Transcribing your recorded voice before grading...';
    dom.resultTranscriptText.textContent = 'Transcribing recorded speech...';
    dom.grammarMistakesSection.classList.add('hidden');
    dom.resultStudentKeywords.classList.add('hidden');
    dom.studentImageStatus.textContent = 'Waiting for transcript...';
    dom.studentLoadingLabel.textContent = 'Transcribing your spoken recording...';
    dom.studentImageLoading.classList.remove('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentImageFallback.classList.add('hidden');

    try {
      const transcribed = await transcribeRecordedAudio(audioCapture.blob, audioCapture.mimeType);
      if (state.sessionGeneration !== gen) return;
      if (transcribed) {
        appendTranscriptText(transcribed);
      }
    } catch (err) {
      if (!state.finalTranscript.trim()) {
        transcriptionError =
          err instanceof Error ? err.message : 'Unable to transcribe recorded audio.';
      }
    }
  }

  const spokenText = state.finalTranscript.trim();
  state.lastSpokenText = spokenText;
  dom.resultTranscriptText.textContent =
    spokenText || 'No spoken transcript was recorded during the test.';

  if (!spokenText) {
    state.lastResult = {
      scorePercent: 0,
      baseScorePercent: 0,
      deductionPercent: 0,
      matchedElements: 0,
      grammarMistakes: [],
      feedback: transcriptionError
        ? 'Audio was recorded, but transcription could not complete right now. Please check your connection and try again.'
        : 'No speech was detected during the test. Check your microphone level bar during the test and speak clearly into the selected microphone.',
    };

    if (transcriptionError) {
      dom.resultsError.textContent = transcriptionError;
      dom.resultsErrorWrap.classList.remove('hidden');
    }

    dom.studentImageLoading.classList.add('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentImageFallback.classList.remove('hidden');
    dom.studentFallbackTitle.textContent = 'No speech captured';
    dom.studentFallbackCopy.textContent =
      'No spoken description was recorded, so a comparison picture could not be generated.';
    dom.studentImageStatus.textContent = 'No transcript';

    dom.scoreValue.textContent = '0%';
    dom.scoreElements.textContent = '0 / 10 keypoints matched';
    dom.scoreBreakdown.textContent = 'Base 0% · 0 grammar mistakes';
    dom.resultsElementsMeta.textContent = '0 of 10 keypoints';
    dom.feedbackText.textContent = state.lastResult.feedback;
    return;
  }

  await runGradingFlow(spokenText);
}

function requestConfirmation(titleText, bodyText, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    if (!dom.confirmModal || !dom.confirmModalOk || !dom.confirmModalCancel) {
      resolve(false);
      return;
    }

    dom.confirmModalTitle.textContent = titleText;
    dom.confirmModalBody.textContent = bodyText;
    dom.confirmModalOk.textContent = confirmLabel;
    dom.confirmModal.classList.remove('hidden');

    const cleanup = (accepted) => {
      dom.confirmModal.classList.add('hidden');
      dom.confirmModalOk.removeEventListener('click', onConfirm);
      dom.confirmModalCancel.removeEventListener('click', onCancel);
      dom.confirmModal.removeEventListener('click', onBackdrop);
      resolve(accepted);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (event) => {
      if (event.target === dom.confirmModal) {
        cleanup(false);
      }
    };

    dom.confirmModalOk.addEventListener('click', onConfirm);
    dom.confirmModalCancel.addEventListener('click', onCancel);
    dom.confirmModal.addEventListener('click', onBackdrop);
  });
}

function updateAuthUI() {
  const token = getAccessToken();
  const isConnected = Boolean(state.googleUser && token);
  state.needsAuth = !isConnected;

  if (dom.googleUserWrap) {
    dom.googleUserWrap.classList.toggle('hidden', !isConnected);
  }
  if (dom.googleUserEmail) {
    dom.googleUserEmail.textContent =
      state.googleUser?.email || state.googleUser?.displayName || '';
  }
  if (dom.formsAuthPrompt) {
    dom.formsAuthPrompt.classList.toggle('hidden', isConnected);
  }
  if (dom.formsWorkspaceContent) {
    dom.formsWorkspaceContent.classList.toggle('hidden', !isConnected);
  }
}

async function handleGoogleSignIn() {
  try {
    if (dom.formsError) hideError(dom.formsError);
    const { user } = await googleSignIn();
    state.googleUser = user;
    updateAuthUI();
    if (state.currentScreen === 'forms') {
      await Promise.all([loadStudentSubmissions(), loadUserFormsList()]);
    }
    return true;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Google sign-in could not be completed.';
    if (state.currentScreen === 'forms' && dom.formsError) {
      showError(dom.formsError, message);
    } else if (state.currentScreen === 'results') {
      dom.resultsError.textContent = message;
      dom.resultsErrorWrap.classList.remove('hidden');
    } else {
      showError(dom.homeError, message);
    }
    return false;
  }
}

async function handleGoogleSignOut() {
  await logout();
  state.googleUser = null;
  state.submissions = [];
  state.userForms = [];
  state.selectedFormId = '';
  updateAuthUI();

  if (dom.submissionsList) {
    dom.submissionsList.textContent = '';
    const p = document.createElement('p');
    p.className = 'forms-empty-text';
    p.textContent = 'Sign in to view recorded student transcripts.';
    dom.submissionsList.appendChild(p);
  }
  if (dom.formsList) {
    dom.formsList.textContent = '';
    const p = document.createElement('p');
    p.className = 'forms-empty-text';
    p.textContent = 'Sign in to view your Google Forms.';
    dom.formsList.appendChild(p);
  }
  if (dom.formDetailBody && dom.formDetailEmpty) {
    dom.formDetailBody.classList.add('hidden');
    dom.formDetailEmpty.classList.remove('hidden');
    dom.formDetailCount.textContent = 'Select a form';
  }
}

function handleAuthTokenFailure(err) {
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('401') || msg.toLowerCase().includes('invalid authentication')) {
    clearAccessToken();
    updateAuthUI();
  }
}

function buildSubmissionPdfEntry(sub) {
  const mistakes = Array.isArray(sub.grammarMistakes) ? sub.grammarMistakes : [];
  const scorePercent = Math.max(0, Math.min(100, Math.round(Number(sub.scorePercent) || 0)));
  const baseScore = Math.max(0, Math.min(100, Math.round(Number(sub.baseScorePercent) || 0)));
  const deduction = Math.max(0, Math.round(Number(sub.deductionPercent) || 0));
  const matched = Math.max(0, Math.min(10, Math.round(Number(sub.matchedElements) || 0)));

  return buildTranscriptPdfDoc({
    sceneTitle: sub.sceneTitle || 'English Speaking Test',
    dateLabel: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '',
    scoreText: `${scorePercent}%`,
    elementsText: `${matched} / 10 keypoints matched`,
    breakdownText: `Base ${baseScore}% · -${deduction}% grammar (${mistakes.length} mistake${mistakes.length === 1 ? '' : 's'})`,
    origDataUrl: null,
    studentDataUrl: null,
    feedbackText: sub.feedback || '',
    grammarMistakes: mistakes,
    spokenTranscript: sub.spokenTranscript || '',
    keywords: sub.keywords || [],
    elements: sub.elements || [],
  });
}

function showDriveUploadStatus(message, webViewLink) {
  if (!dom.formsStatus) return;
  dom.formsStatus.textContent = '';
  const textNode = document.createTextNode(`${message} `);
  dom.formsStatus.appendChild(textNode);

  if (webViewLink && /^https:\/\//i.test(webViewLink)) {
    const link = document.createElement('a');
    link.href = webViewLink;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'btn-link';
    link.textContent = 'Open in Google Drive';
    dom.formsStatus.appendChild(link);
  }
  dom.formsStatus.classList.remove('hidden');
}

async function loadStudentSubmissions() {
  const token = getAccessToken();
  if (!token) {
    updateAuthUI();
    return;
  }

  hideError(dom.formsError);
  if (dom.refreshSubmissionsBtn) {
    dom.refreshSubmissionsBtn.disabled = true;
    dom.refreshSubmissionsBtn.textContent = 'Loading...';
  }

  try {
    const response = await fetch('/api/submissions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error || `Failed to load student transcripts (${response.status})`);
      if (response.status === 401) {
        clearAccessToken();
        updateAuthUI();
      }
      throw err;
    }

    state.submissions = Array.isArray(data.submissions) ? data.submissions : [];
    renderSubmissionsList();
  } catch (err) {
    showError(
      dom.formsError,
      err instanceof Error ? err.message : 'Unable to load student spoken transcripts.'
    );
  } finally {
    if (dom.refreshSubmissionsBtn) {
      dom.refreshSubmissionsBtn.disabled = false;
      dom.refreshSubmissionsBtn.textContent = 'Refresh';
    }
  }
}

function renderSubmissionsList() {
  if (!dom.submissionsList) return;
  dom.submissionsList.textContent = '';

  if (state.submissions.length === 0) {
    const p = document.createElement('p');
    p.className = 'forms-empty-text';
    p.textContent =
      'No student transcripts recorded yet. Completed speaking tests appear here automatically.';
    dom.submissionsList.appendChild(p);
    return;
  }

  state.submissions.forEach((sub) => {
    const card = document.createElement('div');
    card.className = 'submission-card';

    const header = document.createElement('div');
    header.className = 'submission-header';

    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('strong');
    titleEl.className = 'form-list-name';
    titleEl.textContent = sub.sceneTitle || 'English Speaking Test';

    const dateEl = document.createElement('span');
    dateEl.className = 'form-list-meta';
    dateEl.textContent = sub.submittedAt
      ? ` · ${new Date(sub.submittedAt).toLocaleString()}`
      : '';

    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(dateEl);

    const scoreEl = document.createElement('span');
    scoreEl.className = 'submission-score';
    scoreEl.textContent = `${Math.round(Number(sub.scorePercent) || 0)}% · ${Math.round(Number(sub.matchedElements) || 0)}/10`;

    header.appendChild(titleWrap);
    header.appendChild(scoreEl);

    const transcriptEl = document.createElement('p');
    transcriptEl.className = 'submission-transcript';
    transcriptEl.textContent = sub.spokenTranscript || 'No transcript text.';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'forms-link-group';

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'btn btn-secondary btn-compact';
    downloadBtn.textContent = 'Download PDF';
    downloadBtn.addEventListener('click', () => {
      const doc = buildSubmissionPdfEntry(sub);
      const safeStamp = (sub.submittedAt || 'transcript').slice(0, 10).replace(/[^0-9-]/g, '');
      const safeId = (sub.id || 'student').slice(0, 8).replace(/[^a-z0-9]/gi, '');
      doc.save(`speakscene-${safeStamp}-${safeId}.pdf`);
    });

    const saveDriveBtn = document.createElement('button');
    saveDriveBtn.type = 'button';
    saveDriveBtn.className = 'btn btn-primary btn-compact';
    saveDriveBtn.textContent = 'Save PDF to Drive';
    saveDriveBtn.addEventListener('click', async () => {
      const token = getAccessToken();
      if (!token) {
        updateAuthUI();
        return;
      }

      const safeTitle = sub.sceneTitle || 'Speaking Test';
      const confirmed = await requestConfirmation(
        'Save Student PDF to Drive?',
        `Upload the graded PDF transcript for "${safeTitle}" into your Google Drive folder "SpeakScene Student Transcripts"?`,
        'Save PDF'
      );
      if (!confirmed) return;

      saveDriveBtn.disabled = true;
      const prevLabel = saveDriveBtn.textContent;
      saveDriveBtn.textContent = 'Uploading...';
      hideError(dom.formsError);
      hideError(dom.formsStatus);

      try {
        const doc = buildSubmissionPdfEntry(sub);
        const pdfBlob = doc.output('blob');
        const safeStamp = (sub.submittedAt || new Date().toISOString())
          .slice(0, 16)
          .replace(/[^0-9]/g, '-');
        const safeSlug = (sub.sceneId || 'scene').replace(/[^a-z0-9_-]/gi, '-').slice(0, 24);
        const filename = `speakscene-${safeStamp}-${safeSlug}.pdf`;

        const uploaded = await uploadTranscriptPdfToDrive(token, filename, pdfBlob);
        showDriveUploadStatus(`Saved "${uploaded.name}" to Google Drive.`, uploaded.webViewLink);
      } catch (err) {
        handleAuthTokenFailure(err);
        showError(
          dom.formsError,
          err instanceof Error ? err.message : 'Unable to upload transcript PDF to Google Drive.'
        );
      } finally {
        saveDriveBtn.textContent = prevLabel;
        saveDriveBtn.disabled = false;
      }
    });

    actionsRow.appendChild(downloadBtn);
    actionsRow.appendChild(saveDriveBtn);

    card.appendChild(header);
    card.appendChild(transcriptEl);
    card.appendChild(actionsRow);
    dom.submissionsList.appendChild(card);
  });
}

async function loadUserFormsList() {
  const token = getAccessToken();
  if (!token) {
    updateAuthUI();
    return;
  }

  hideError(dom.formsError);
  if (dom.refreshFormsBtn) {
    dom.refreshFormsBtn.disabled = true;
    dom.refreshFormsBtn.textContent = 'Loading...';
  }

  try {
    const files = await listUserForms(token);
    state.userForms = files;
    renderFormsList();
  } catch (err) {
    handleAuthTokenFailure(err);
    showError(
      dom.formsError,
      err instanceof Error ? err.message : 'Unable to load Google Forms.'
    );
  } finally {
    if (dom.refreshFormsBtn) {
      dom.refreshFormsBtn.disabled = false;
      dom.refreshFormsBtn.textContent = 'Refresh';
    }
  }
}

function renderFormsList() {
  if (!dom.formsList) return;
  dom.formsList.textContent = '';

  if (state.userForms.length === 0) {
    const p = document.createElement('p');
    p.className = 'forms-empty-text';
    p.textContent = 'No Google Forms found yet. Click "New Form" to create one.';
    dom.formsList.appendChild(p);
    return;
  }

  state.userForms.forEach((file) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `form-list-item${file.id === state.selectedFormId ? ' active' : ''}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'form-list-name';
    nameSpan.textContent = file.name || 'Untitled Form';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'form-list-meta';
    metaSpan.textContent = file.modifiedTime
      ? new Date(file.modifiedTime).toLocaleDateString()
      : 'Form';

    btn.appendChild(nameSpan);
    btn.appendChild(metaSpan);
    btn.addEventListener('click', () => loadSelectedFormDetails(file.id));
    dom.formsList.appendChild(btn);
  });
}

async function loadSelectedFormDetails(formId) {
  const token = getAccessToken();
  if (!token || !formId) return;

  state.selectedFormId = formId;
  renderFormsList();
  hideError(dom.formsError);
  dom.formDetailCount.textContent = 'Loading...';

  try {
    const [details, responses] = await Promise.all([
      getFormDetails(token, formId),
      getFormResponses(token, formId).catch(() => []),
    ]);

    renderFormDetails(details, responses);
  } catch (err) {
    handleAuthTokenFailure(err);
    showError(
      dom.formsError,
      err instanceof Error ? err.message : 'Unable to open selected form.'
    );
  }
}

function renderFormDetails(details, responses) {
  dom.formDetailEmpty.classList.add('hidden');
  dom.formDetailBody.classList.remove('hidden');

  dom.formDetailTitle.textContent = details?.info?.title || 'Untitled Google Form';
  const safeId = encodeURIComponent(details.formId);
  dom.formOpenLink.href =
    details.responderUri || `https://docs.google.com/forms/d/${safeId}/viewform`;
  dom.formEditLink.href = `https://docs.google.com/forms/d/${safeId}/edit`;

  const items = Array.isArray(details.items) ? details.items : [];
  dom.formDetailCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${responses.length} response${responses.length === 1 ? '' : 's'}`;

  dom.formItemsList.textContent = '';
  const questionTitleById = new Map();

  if (items.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'This form does not contain any questions yet.';
    dom.formItemsList.appendChild(li);
  } else {
    items.forEach((item) => {
      const qId = item?.questionItem?.question?.questionId;
      if (qId && item.title) {
        questionTitleById.set(qId, item.title);
      }
      const li = document.createElement('li');
      li.textContent = item.title || item.description || 'Untitled item';
      dom.formItemsList.appendChild(li);
    });
  }

  dom.formResponsesList.textContent = '';
  if (responses.length === 0) {
    const li = document.createElement('li');
    li.className = 'grammar-item';
    li.textContent = 'No student responses submitted yet.';
    dom.formResponsesList.appendChild(li);
  } else {
    responses.slice(0, 15).forEach((resp, index) => {
      const li = document.createElement('li');
      li.className = 'grammar-item';
      const submittedAt = resp.lastSubmittedTime
        ? new Date(resp.lastSubmittedTime).toLocaleString()
        : `Submission ${index + 1}`;
      const answerParts = [];
      if (resp.answers && typeof resp.answers === 'object') {
        Object.values(resp.answers).forEach((ans) => {
          const vals = (ans?.textAnswers?.answers || [])
            .map((a) => a.value)
            .filter(Boolean);
          if (vals.length > 0) {
            const label = questionTitleById.get(ans.questionId) || 'Answer';
            answerParts.push(`${label}: ${vals.join(', ')}`);
          }
        });
      }
      li.textContent = `${submittedAt} — ${answerParts.join(' | ') || 'Submitted'}`;
      dom.formResponsesList.appendChild(li);
    });
  }
}

function buildCurrentSceneFormPayload() {
  const hasScene = Boolean(state.sceneTitle);
  return {
    title: hasScene
      ? `SpeakScene: ${state.sceneTitle}`
      : 'SpeakScene English Speaking Practice',
    sceneTitle: state.sceneTitle || 'Everyday Scene Practice',
    keywords: state.sceneKeywords.length > 0 ? state.sceneKeywords : ['people', 'actions', 'objects'],
    elements: state.sceneElements,
    scorePercent: state.lastResult?.scorePercent,
    spokenTranscript: state.lastSpokenText,
    feedback: state.lastResult?.feedback,
  };
}

async function handleCreatePracticeFormInWorkspace() {
  const token = getAccessToken();
  if (!token) {
    updateAuthUI();
    return;
  }

  const payload = buildCurrentSceneFormPayload();
  const confirmed = await requestConfirmation(
    'Create New Google Form?',
    `Create a new Google Form titled "${payload.title}" in your Google Drive with speaking practice questions?`,
    'Create Form'
  );
  if (!confirmed) return;

  dom.createPracticeFormBtn.disabled = true;
  hideError(dom.formsError);
  hideError(dom.formsStatus);

  try {
    const created = await createSpeakingForm(token, payload);
    dom.formsStatus.textContent = `Created Google Form "${created.title}".`;
    dom.formsStatus.classList.remove('hidden');
    await loadUserFormsList();
    await loadSelectedFormDetails(created.formId);
  } catch (err) {
    handleAuthTokenFailure(err);
    showError(
      dom.formsError,
      err instanceof Error ? err.message : 'Failed to create Google Form.'
    );
  } finally {
    dom.createPracticeFormBtn.disabled = false;
  }
}

async function openTeacherPortal() {
  if (state.isTesting) {
    resetTestView();
  }
  hideError(dom.formsError);
  hideError(dom.formsStatus);
  showScreen('forms');
  updateAuthUI();
  if (getAccessToken()) {
    await Promise.all([loadStudentSubmissions(), loadUserFormsList()]);
  }
}

function checkTeacherRoute() {
  const isTeacherHash = window.location.hash === '#teacher';
  const isTeacherQuery = new URLSearchParams(window.location.search).get('teacher') === '1';
  if (isTeacherHash || isTeacherQuery) {
    void openTeacherPortal();
  }
}

initAuth(
  (user) => {
    state.googleUser = user;
    updateAuthUI();
  },
  (user) => {
    state.googleUser = user;
    updateAuthUI();
  }
);
updateAuthUI();

dom.startTestBtn.addEventListener('click', startTest);
dom.finishEarlyBtn.addEventListener('click', finishTest);
dom.restartMicBtn.addEventListener('click', async () => {
  if (!state.isTesting) return;
  setMicState('idle', 'Restarting microphone...');
  startSpeechRecognition();
  await startAudioCapture(state.selectedDeviceId);
});
if (dom.micDeviceSelect) {
  dom.micDeviceSelect.addEventListener('change', async () => {
    if (!state.isTesting) return;
    state.selectedDeviceId =
      dom.micDeviceSelect instanceof HTMLSelectElement ? dom.micDeviceSelect.value : '';
    setMicState('idle', 'Switching microphone...');
    await startAudioCapture(state.selectedDeviceId);
  });
}
if (dom.listenSceneBtn) {
  dom.listenSceneBtn.addEventListener('click', toggleSceneAudioDescription);
}
if (dom.formsBackBtn) {
  dom.formsBackBtn.addEventListener('click', () => {
    if (window.location.hash === '#teacher') {
      window.location.hash = '';
    }
    showScreen('home');
  });
}
if (dom.formsPanelSigninBtn) {
  dom.formsPanelSigninBtn.addEventListener('click', handleGoogleSignIn);
}
if (dom.googleSignoutBtn) {
  dom.googleSignoutBtn.addEventListener('click', handleGoogleSignOut);
}
if (dom.refreshSubmissionsBtn) {
  dom.refreshSubmissionsBtn.addEventListener('click', loadStudentSubmissions);
}
if (dom.refreshFormsBtn) {
  dom.refreshFormsBtn.addEventListener('click', loadUserFormsList);
}
if (dom.createPracticeFormBtn) {
  dom.createPracticeFormBtn.addEventListener('click', handleCreatePracticeFormInWorkspace);
}
dom.exportPdfBtn.addEventListener('click', exportResultsPdf);
dom.retryGradeBtn.addEventListener('click', () => {
  if (state.lastSpokenText) {
    runGradingFlow(state.lastSpokenText);
  }
});
dom.cancelTestBtn.addEventListener('click', () => {
  resetTestView();
  showScreen('home');
});
dom.restartTestBtn.addEventListener('click', () => {
  resetTestView();
  showScreen('home');
});
window.addEventListener('hashchange', checkTeacherRoute);
checkTeacherRoute();
