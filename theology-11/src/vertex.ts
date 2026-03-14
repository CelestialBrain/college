import { VertexAI, type Part } from '@google-cloud/vertexai';

const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION ?? 'us-central1';

if (!projectId) {
  throw new Error('GCP_PROJECT_ID environment variable is not set.');
}

const vertexAI = new VertexAI({ project: projectId, location });

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-pro',
});

/**
 * Send a text prompt (and optional inline base64 file) to Gemini and return
 * the full text response.
 *
 * @param prompt     The text prompt to send.
 * @param fileBase64 Base64-encoded file content (e.g. a PDF).
 * @param mimeType   MIME type of the file (e.g. 'application/pdf').
 */
export async function callGemini(
  prompt: string,
  fileBase64?: string,
  mimeType?: string,
): Promise<string> {
  try {
    const parts: Part[] = [];

    if (fileBase64 && mimeType) {
      parts.push({
        inlineData: {
          data: fileBase64,
          mimeType,
        },
      });
    }

    parts.push({ text: prompt });

    const request = {
      contents: [{ role: 'user' as const, parts }],
    };

    const result = await model.generateContent(request);
    const response = result.response;

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini returned no candidates.');
    }

    const textParts = candidates[0].content?.parts ?? [];
    const text = textParts
      .map((p) => ('text' in p ? (p.text ?? '') : ''))
      .join('');

    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API call failed: ${message}`);
  }
}
