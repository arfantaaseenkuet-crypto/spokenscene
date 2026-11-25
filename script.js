const TEST_DURATION_SECONDS = 120;

const state = {
  currentScreen: 'home',
  sceneDescription: '',
  questionImageUrl: '',
  finalTranscript: '',
  interimTranscript: '',
  remainingSeconds: TEST_DURATION_SECONDS,
  isTesting: false,
  timerStarted: false,
  recognition: null,
  timerInterval: null,
  imageFallbackTimer: null,
};

const dom = {
  homeScreen: document.getElementById('home-screen'),
  testScreen: document.getElementById('test-screen'),
  resultsScreen: document.getElementById('results-screen'),

  startTestBtn: document.getElementById('start-test-btn'),
  homeError: document.getElementById('home-error'),

  timerDisplay: document.getElementById('timer-display'),
  timerProgress: document.getElementById('timer-progress'),
  finishEarlyBtn: document.getElementById('finish-early-btn'),
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
  transcriptPlaceholder: document.getElementById('transcript-placeholder'),
  finalTranscriptEl: document.getElementById('final-transcript'),
  interimTranscriptEl: document.getElementById('interim-transcript'),
  transcriptBox: document.getElementById('transcript-box'),
  wordCountEl: document.getElementById('word-count'),

  restartTestBtn: document.getElementById('restart-test-btn'),
  resultsError: document.getElementById('results-error'),
  resultsElementsMeta: document.getElementById('results-elements-meta'),
  scoreValue: document.getElementById('score-value'),
  scoreElements: document.getElementById('score-elements'),
  feedbackText: document.getElementById('feedback-text'),
  resultOriginalImage: document.getElementById('result-original-image'),
  resultOriginalFallback: document.getElementById('result-original-fallback'),
  studentImageStatus: document.getElementById('student-image-status'),
  studentImageLoading: document.getElementById('student-image-loading'),
  resultStudentImage: document.getElementById('result-student-image'),
  studentImageFallback: document.getElementById('student-image-fallback'),
  studentFallbackTitle: document.getElementById('student-fallback-title'),
  studentFallbackCopy: document.getElementById('student-fallback-copy'),
  resultTranscriptText: document.getElementById('result-transcript-text'),
  resultReferenceText: document.getElementById('result-reference-text'),
};

function showScreen(screenName) {
  state.currentScreen = screenName;
  dom.homeScreen.classList.toggle('hidden', screenName !== 'home');
  dom.testScreen.classList.toggle('hidden', screenName !== 'test');
  dom.resultsScreen.classList.toggle('hidden', screenName !== 'results');
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

function buildPollinationsUrl(promptText) {
  const cleaned = promptText.replace(/\s+/g, ' ').trim();
  const capped = cleaned.length > 1400 ? `${cleaned.slice(0, 1400)}` : cleaned;
  return `https://pollinations.ai/p/${encodeURIComponent(capped)}?width=960&height=720&nologo=true`;
}

function setMicState(mode, label) {
  dom.micStatus.classList.remove('mic-idle', 'mic-listening', 'mic-error');
  dom.micStatus.classList.add(`mic-${mode}`);
  dom.micStatusLabel.textContent = label;
}

function updateTranscriptDisplay() {
  const combined = `${state.finalTranscript} ${state.interimTranscript}`.trim();
  const hasText = combined.length > 0;

  dom.transcriptPlaceholder.classList.toggle('hidden', hasText);
  dom.finalTranscriptEl.textContent = state.finalTranscript;
  dom.interimTranscriptEl.textContent =
    state.interimTranscript ? ` ${state.interimTranscript}` : '';

  const wordCount = combined ? combined.split(/\s+/).filter(Boolean).length : 0;
  dom.wordCountEl.textContent = String(wordCount);
  dom.transcriptBox.scrollTop = dom.transcriptBox.scrollHeight;
}

async function generateSceneDescription() {
  const response = await fetch('/api/scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Scene generation failed (${response.status}).`);
  }

  if (!data?.description) {
    throw new Error('Server returned an empty scene description.');
  }

  return data.description;
}

async function gradeTranscript(originalScene, studentTranscript) {
  const response = await fetch('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalScene, studentTranscript }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Grading request failed (${response.status}).`);
  }

  return data;
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

function startSpeechRecognition() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    setMicState('error', 'Speech API unsupported');
    showError(
      dom.speechWarning,
      'This browser does not support webkitSpeechRecognition. Please use Google Chrome or Microsoft Edge for voice capture.'
    );
    return;
  }

  hideError(dom.speechWarning);

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    if (state.isTesting) {
      setMicState('listening', 'Listening');
    }
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcriptPiece = result[0]?.transcript || '';
      if (result.isFinal) {
        state.finalTranscript = `${state.finalTranscript} ${transcriptPiece}`.trim();
      } else {
        interim += transcriptPiece;
      }
    }
    state.interimTranscript = interim.trim();
    updateTranscriptDisplay();
  };

  recognition.onerror = (event) => {
    if (!state.isTesting) return;

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setMicState('error', 'Microphone blocked');
      showError(
        dom.speechWarning,
        'Microphone access was denied. Enable microphone permissions in your browser and restart the test.'
      );
      state.isTesting = false;
      stopSpeechRecognition();
    } else if (event.error === 'audio-capture') {
      setMicState('error', 'No microphone detected');
      showError(
        dom.speechWarning,
        'No active microphone was found. Connect a microphone and restart the test.'
      );
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      setMicState('error', `Voice error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    if (state.isTesting) {
      try {
        recognition.start();
      } catch (_err) {
        setMicState('idle', 'Paused');
      }
    }
  };

  state.recognition = recognition;
  try {
    recognition.start();
  } catch (_err) {
    setMicState('error', 'Unable to start mic');
  }
}

function stopSpeechRecognition() {
  if (state.recognition) {
    const activeRecognition = state.recognition;
    state.recognition = null;
    activeRecognition.onend = null;
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
  cleanupTimers();
  stopSpeechRecognition();

  state.sceneDescription = '';
  state.questionImageUrl = '';
  state.finalTranscript = '';
  state.interimTranscript = '';
  state.remainingSeconds = TEST_DURATION_SECONDS;
  state.isTesting = false;
  state.timerStarted = false;

  hideError(dom.testError);
  hideError(dom.speechWarning);

  dom.timerDisplay.textContent = formatTime(TEST_DURATION_SECONDS);
  dom.timerDisplay.classList.remove('timer-warning');
  dom.timerProgress.style.transform = 'scaleX(1)';
  dom.finishEarlyBtn.disabled = false;

  dom.sceneStatusText.textContent = 'Generating scene...';
  dom.questionLoadingLabel.textContent = 'Generating scene description with Gemini...';
  dom.questionImageLoading.classList.remove('hidden');
  dom.questionImage.classList.add('hidden');
  dom.questionImage.removeAttribute('src');
  dom.questionImageFallback.classList.add('hidden');

  setMicState('idle', 'Waiting for microphone');
  updateTranscriptDisplay();
}

async function startTest() {
  hideError(dom.homeError);
  dom.startTestBtn.disabled = true;

  resetTestView();
  showScreen('test');
  state.isTesting = true;

  try {
    const description = await generateSceneDescription();
    if (!state.isTesting) return;

    state.sceneDescription = description;
    state.questionImageUrl = buildPollinationsUrl(description);

    dom.questionLoadingLabel.textContent = 'Rendering scene illustration...';
    dom.sceneStatusText.textContent = 'Loading image...';

    dom.questionImage.onload = () => {
      if (!state.isTesting) return;
      dom.questionImageLoading.classList.add('hidden');
      dom.questionImageFallback.classList.add('hidden');
      dom.questionImage.classList.remove('hidden');
      dom.sceneStatusText.textContent = 'Ready — start describing';
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

    // Safeguard so the student can begin speaking even if external image generation takes longer
    state.imageFallbackTimer = window.setTimeout(() => {
      if (state.isTesting && !state.timerStarted) {
        startCountdownTimer();
      }
    }, 6000);

    startSpeechRecognition();
  } catch (err) {
    state.isTesting = false;
    cleanupTimers();
    stopSpeechRecognition();
    showScreen('home');
    showError(dom.homeError, err.message || 'Unable to start the speaking test.');
  } finally {
    dom.startTestBtn.disabled = false;
  }
}

async function finishTest() {
  if (!state.isTesting) return;

  state.isTesting = false;
  dom.finishEarlyBtn.disabled = true;
  cleanupTimers();
  stopSpeechRecognition();
  setMicState('idle', 'Recording stopped');

  const spokenText = `${state.finalTranscript} ${state.interimTranscript}`.trim();

  // Prepare Results Screen
  showScreen('results');
  hideError(dom.resultsError);

  dom.scoreValue.textContent = '--%';
  dom.scoreElements.textContent = 'Grading response...';
  dom.resultsElementsMeta.textContent = 'Evaluating 10 elements';
  dom.feedbackText.textContent =
    'Analyzing your spoken description against the 10 key scene elements...';

  dom.resultTranscriptText.textContent =
    spokenText || 'No spoken transcript was recorded during the test.';
  dom.resultReferenceText.textContent = state.sceneDescription;

  // Original Question Picture
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

  // Student Generated Picture & Grading
  if (!spokenText) {
    dom.studentImageLoading.classList.add('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentImageFallback.classList.remove('hidden');
    dom.studentFallbackTitle.textContent = 'No speech captured';
    dom.studentFallbackCopy.textContent =
      'No spoken description was recorded, so a comparison picture could not be generated.';
    dom.studentImageStatus.textContent = 'No transcript';

    dom.scoreValue.textContent = '0%';
    dom.scoreElements.textContent = '0 / 10 elements described';
    dom.resultsElementsMeta.textContent = '0 of 10 elements';
    dom.feedbackText.textContent =
      'No speech was detected during the test. Check your microphone connection and try describing the people, animals, objects, and actions in the scene.';
    return;
  }

  // Generate student's final picture using Pollinations.ai
  const studentImageUrl = buildPollinationsUrl(spokenText);
  dom.studentImageStatus.textContent = 'Generating from speech...';
  dom.studentImageLoading.classList.remove('hidden');
  dom.resultStudentImage.classList.add('hidden');
  dom.studentImageFallback.classList.add('hidden');

  dom.resultStudentImage.onload = () => {
    dom.studentImageLoading.classList.add('hidden');
    dom.studentImageFallback.classList.add('hidden');
    dom.resultStudentImage.classList.remove('hidden');
    dom.studentImageStatus.textContent = 'Generated from your speech';
  };

  dom.resultStudentImage.onerror = () => {
    dom.studentImageLoading.classList.add('hidden');
    dom.resultStudentImage.classList.add('hidden');
    dom.studentFallbackTitle.textContent = 'Student image unavailable';
    dom.studentFallbackCopy.textContent =
      'Pollinations could not render an image from the transcript right now.';
    dom.studentImageFallback.classList.remove('hidden');
    dom.studentImageStatus.textContent = 'Image load failed';
  };

  dom.resultStudentImage.src = studentImageUrl;

  // Grade spoken transcript with Gemini simultaneously
  try {
    const result = await gradeTranscript(state.sceneDescription, spokenText);
    const boundedScore = Math.max(0, Math.min(100, Math.round(Number(result.scorePercent) || 0)));
    const boundedMatched = Math.max(
      0,
      Math.min(10, Math.round(Number(result.matchedElements) || 0))
    );

    dom.scoreValue.textContent = `${boundedScore}%`;
    dom.scoreElements.textContent = `${boundedMatched} / 10 elements described`;
    dom.resultsElementsMeta.textContent = `${boundedMatched} of 10 elements`;
    dom.feedbackText.textContent = result.feedback || 'Grading complete.';
  } catch (err) {
    dom.scoreValue.textContent = 'N/A';
    dom.scoreElements.textContent = 'Grading unavailable';
    dom.feedbackText.textContent = 'Could not complete automated grading.';
    showError(dom.resultsError, err.message || 'Failed to grade spoken response.');
  }
}

dom.startTestBtn.addEventListener('click', startTest);
dom.finishEarlyBtn.addEventListener('click', finishTest);
dom.cancelTestBtn.addEventListener('click', () => {
  resetTestView();
  showScreen('home');
});
dom.restartTestBtn.addEventListener('click', () => {
  resetTestView();
  showScreen('home');
});
