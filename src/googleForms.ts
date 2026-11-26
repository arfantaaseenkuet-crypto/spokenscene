export interface DriveFormFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface FormQuestionItem {
  itemId?: string;
  title?: string;
  description?: string;
  questionItem?: {
    question?: {
      questionId?: string;
      required?: boolean;
      textQuestion?: { paragraph?: boolean };
      choiceQuestion?: {
        type?: string;
        options?: Array<{ value?: string }>;
      };
    };
  };
}

export interface GoogleFormDetails {
  formId: string;
  info?: {
    title?: string;
    description?: string;
    documentTitle?: string;
  };
  responderUri?: string;
  items?: FormQuestionItem[];
}

export interface GoogleFormResponseRecord {
  responseId?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  respondentEmail?: string;
  answers?: Record<
    string,
    {
      questionId?: string;
      textAnswers?: {
        answers?: Array<{ value?: string }>;
      };
    }
  >;
}

export interface SpeakingFormPayload {
  title: string;
  sceneTitle: string;
  keywords: string[];
  elements: string[];
  scorePercent?: number;
  spokenTranscript?: string;
  feedback?: string;
}

async function parseGoogleApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    if (data?.error?.message) {
      return data.error.message;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return `${fallback} (${response.status})`;
}

export async function listUserForms(accessToken: string): Promise<DriveFormFile[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.form' and trashed=false");
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&pageSize=20&fields=${fields}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(await parseGoogleApiError(response, 'Failed to list Google Forms'));
  }

  const data = (await response.json()) as { files?: DriveFormFile[] };
  return Array.isArray(data.files) ? data.files : [];
}

export async function getFormDetails(
  accessToken: string,
  formId: string
): Promise<GoogleFormDetails> {
  const safeFormId = encodeURIComponent(formId.trim());
  const response = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(await parseGoogleApiError(response, 'Failed to load form details'));
  }

  return (await response.json()) as GoogleFormDetails;
}

export async function getFormResponses(
  accessToken: string,
  formId: string
): Promise<GoogleFormResponseRecord[]> {
  const safeFormId = encodeURIComponent(formId.trim());
  const response = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}/responses`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(await parseGoogleApiError(response, 'Failed to load form responses'));
  }

  const data = (await response.json()) as { responses?: GoogleFormResponseRecord[] };
  return Array.isArray(data.responses) ? data.responses : [];
}

export async function createSpeakingForm(
  accessToken: string,
  payload: SpeakingFormPayload
): Promise<{
  formId: string;
  title: string;
  responderUri: string;
  editUrl: string;
}> {
  const formTitle = payload.title.trim() || `SpeakScene Practice: ${payload.sceneTitle}`;

  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: formTitle,
        documentTitle: formTitle,
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(await parseGoogleApiError(createRes, 'Failed to create Google Form'));
  }

  const created = (await createRes.json()) as GoogleFormDetails;
  const safeFormId = encodeURIComponent(created.formId);

  const descriptionLines = [
    `Topic: ${payload.sceneTitle || 'English Picture Description'}`,
    payload.keywords.length > 0 ? `Keypoints: ${payload.keywords.slice(0, 12).join(', ')}` : '',
    typeof payload.scorePercent === 'number'
      ? `Reference Test Score: ${payload.scorePercent}%`
      : '',
    payload.feedback ? `Examiner Note: ${payload.feedback}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const keypointChoices = payload.keywords
    .slice(0, 4)
    .map((k) => ({ value: k }))
    .filter((o) => o.value.trim().length > 0);

  const requests: Array<Record<string, unknown>> = [
    {
      updateFormInfo: {
        info: {
          description: descriptionLines || 'SpeakScene English speaking & writing practice form.',
        },
        updateMask: 'description',
      },
    },
    {
      createItem: {
        item: {
          title: 'Student Full Name',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 0 },
      },
    },
    {
      createItem: {
        item: {
          title: `Describe the scene "${payload.sceneTitle || 'Picture'}" in 5 to 8 clear English sentences.`,
          description:
            payload.keywords.length > 0
              ? `Try to include keypoints such as: ${payload.keywords.slice(0, 8).join(', ')}`
              : 'Describe the people, actions, and objects you observed.',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 1 },
      },
    },
  ];

  let nextIndex = 2;

  if (keypointChoices.length >= 2) {
    requests.push({
      createItem: {
        item: {
          title: 'Which scene element did you describe first?',
          questionItem: {
            question: {
              required: false,
              choiceQuestion: {
                type: 'RADIO',
                options: keypointChoices,
              },
            },
          },
        },
        location: { index: nextIndex },
      },
    });
    nextIndex += 1;
  }

  requests.push({
    createItem: {
      item: {
        title: 'Grammar & Listening Practice: Write one improved sentence from the reference description.',
        description:
          payload.elements.length > 0
            ? `Example reference: ${payload.elements.slice(0, 2).join(' ')}`
            : 'Write a complete, grammatically accurate sentence.',
        questionItem: {
          question: {
            required: false,
            textQuestion: { paragraph: true },
          },
        },
      },
      location: { index: nextIndex },
    },
  });

  const batchRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!batchRes.ok) {
    throw new Error(await parseGoogleApiError(batchRes, 'Created form, but failed to add questions'));
  }

  const updated = await getFormDetails(accessToken, created.formId);
  return {
    formId: created.formId,
    title: updated.info?.title || formTitle,
    responderUri:
      updated.responderUri ||
      created.responderUri ||
      `https://docs.google.com/forms/d/${safeFormId}/viewform`,
    editUrl: `https://docs.google.com/forms/d/${safeFormId}/edit`,
  };
}

export async function appendSpeakingPromptToForm(
  accessToken: string,
  formId: string,
  payload: SpeakingFormPayload
): Promise<GoogleFormDetails> {
  const current = await getFormDetails(accessToken, formId);
  const insertIndex = Array.isArray(current.items) ? current.items.length : 0;
  const safeFormId = encodeURIComponent(formId.trim());

  const batchRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            createItem: {
              item: {
                title: `Speaking Practice (${payload.sceneTitle || 'Scene'}): Summarize what happened in 4–6 sentences.`,
                description:
                  payload.keywords.length > 0
                    ? `Keypoints: ${payload.keywords.slice(0, 10).join(', ')}`
                    : 'Use clear past or present continuous English sentences.',
                questionItem: {
                  question: {
                    required: false,
                    textQuestion: { paragraph: true },
                  },
                },
              },
              location: { index: insertIndex },
            },
          },
        ],
      }),
    }
  );

  if (!batchRes.ok) {
    throw new Error(await parseGoogleApiError(batchRes, 'Failed to add question to Google Form'));
  }

  return getFormDetails(accessToken, formId);
}

async function getOrCreateTranscriptFolder(accessToken: string): Promise<string | null> {
  const folderQuery = encodeURIComponent(
    "name='SpeakScene Student Transcripts' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as { files?: Array<{ id?: string }> };
    const existingId = searchData.files?.[0]?.id;
    if (existingId) {
      return existingId;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'SpeakScene Student Transcripts',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    return null;
  }
  const folder = (await createRes.json()) as { id?: string };
  return folder.id || null;
}

export async function uploadTranscriptPdfToDrive(
  accessToken: string,
  filename: string,
  pdfBlob: Blob
): Promise<{ id: string; name: string; webViewLink: string }> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const folderId = await getOrCreateTranscriptFolder(accessToken);

  const metadata: Record<string, unknown> = {
    name: safeName,
    mimeType: 'application/pdf',
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  formData.append('file', pdfBlob, safeName);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(await parseGoogleApiError(uploadRes, 'Failed to upload PDF to Google Drive'));
  }

  const file = (await uploadRes.json()) as {
    id?: string;
    name?: string;
    webViewLink?: string;
  };
  const safeId = encodeURIComponent(file.id || '');
  return {
    id: file.id || '',
    name: file.name || safeName,
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${safeId}/view`,
  };
}
