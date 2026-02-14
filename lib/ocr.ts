import type { OcrMedication, OcrResult } from "@/lib/types";

interface OpenAiResponsesSuccess {
  output_text?: string;
}

function parseJsonObject<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function buildFallback(fileName: string): OcrResult {
  const nameFromFile = fileName.replace(/\.[a-zA-Z0-9]+$/, "").trim() || "알 수 없는 약";

  const fallbackMedication: OcrMedication = {
    name: nameFromFile,
    ingredient: "알 수 없음",
    dose: "알 수 없음",
    freq: "알 수 없음",
    days: "알 수 없음",
    confidence: 35
  };

  return {
    medications: [fallbackMedication],
    rawText: "OCR 제공자 설정이 없어 기본 추정 결과를 사용했습니다.",
    averageConfidence: 35,
    needsReview: true,
    unknownFields: ["ingredient", "dose", "freq", "days"],
    provider: "fallback"
  };
}

function sanitizeMedication(item: Partial<OcrMedication>): OcrMedication {
  return {
    name: (item.name || "알 수 없는 약").toString(),
    ingredient: (item.ingredient || "알 수 없음").toString(),
    dose: (item.dose || "알 수 없음").toString(),
    freq: (item.freq || "알 수 없음").toString(),
    days: (item.days || "알 수 없음").toString(),
    confidence: clampConfidence(Number(item.confidence ?? 50))
  };
}

interface OpenAiMedicationResponse {
  medications?: Partial<OcrMedication>[];
  raw_text?: string;
  unknown_fields?: string[];
}

async function runOpenAiVision(file: File): Promise<OcrResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "image/png";
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      medications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            ingredient: { type: "string" },
            dose: { type: "string" },
            freq: { type: "string" },
            days: { type: "string" },
            confidence: { type: "number" }
          },
          required: ["name", "ingredient", "dose", "freq", "days", "confidence"]
        }
      },
      raw_text: { type: "string" },
      unknown_fields: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["medications", "raw_text", "unknown_fields"]
  };

  const payload = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "이미지의 처방/약봉지 텍스트를 OCR로 읽고 JSON 스키마에 맞춰 출력하세요. 불확실한 값은 '알 수 없음'으로 채우고 confidence는 0~100으로 제공하세요."
          },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${base64}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "prescription_ocr",
        schema,
        strict: true
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OpenAiResponsesSuccess;
  const outputText = data.output_text || "";
  const parsed = parseJsonObject<OpenAiMedicationResponse>(outputText);
  if (!parsed || !Array.isArray(parsed.medications) || parsed.medications.length === 0) {
    return null;
  }

  const medications = parsed.medications.map(sanitizeMedication);
  const avg = Math.round(
    medications.reduce((sum, med) => sum + med.confidence, 0) / medications.length
  );

  return {
    medications,
    rawText: parsed.raw_text || outputText,
    averageConfidence: clampConfidence(avg),
    needsReview: avg < 70,
    unknownFields: Array.isArray(parsed.unknown_fields) ? parsed.unknown_fields : [],
    provider: "openai-vision"
  };
}

export async function extractPrescriptionFromImage(file: File): Promise<OcrResult> {
  try {
    const openAiResult = await runOpenAiVision(file);
    if (openAiResult) {
      return openAiResult;
    }
  } catch {
    // 실패 시 fallback
  }

  return buildFallback(file.name);
}
