import type { OcrMedication, OcrResult, RiskLevel, SafetyAnalysisResult, UserProfile } from "@/lib/types";

interface OpenAiResponsesSuccess {
  output_text?: string;
}

interface LlmSafetyResponse {
  summary_line?: string;
  recognized_prescription?: string[];
  key_safety_checks?: string[];
  profile_warnings?: string[];
  common_side_effects?: string[];
  general_precautions?: string[];
  pharmacist_questions?: string[];
  confidence_and_limits?: string[];
  risk_level?: RiskLevel;
  risk_reason?: string;
  risk_evidence?: string[];
  emergency_warning?: string;
}

const EMERGENCY_KEYWORDS = [
  "호흡곤란",
  "숨이 안",
  "목 붓",
  "얼굴 붓",
  "심한 발진",
  "흉통",
  "의식저하",
  "의식이 흐려",
  "심한 저혈당"
];

const HIGH_RISK_INGREDIENTS = ["warfarin", "리튬", "digoxin", "insulin", "메토트렉세이트"];

const COMMON_SIDE_EFFECT_LIBRARY = [
  "메스꺼움, 어지러움, 졸림, 위장 불편 등은 흔한 부작용일 수 있습니다.",
  "복용 초기에 증상 변화가 있으면 시간/강도를 기록해 의료진과 공유하세요.",
  "발진, 호흡곤란, 심한 부종은 드문 중증 반응 신호일 수 있어 즉시 진료가 필요합니다."
];

const FORBIDDEN_PHRASES = ["처방을 바꾸세요", "복용을 중단하세요", "용량을 늘리세요", "용량을 줄이세요", "진단 결과"];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function parseJsonObject<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item))
    .filter(Boolean)
    .slice(0, 10);
}

function joinMedicationLine(med: OcrMedication): string {
  return `${med.name} | 성분: ${med.ingredient} | 용량: ${med.dose} | 횟수: ${med.freq} | 기간: ${med.days} | 신뢰도 ${med.confidence}%`;
}

function detectEmergency(profile: UserProfile, ocr: OcrResult): string | undefined {
  const corpus = [
    profile.userQuestion || "",
    profile.currentMedications || "",
    ocr.rawText,
    ...ocr.medications.map((m) => `${m.name} ${m.ingredient}`)
  ]
    .join(" ")
    .toLowerCase();

  const found = EMERGENCY_KEYWORDS.find((keyword) => corpus.includes(keyword));
  if (!found) return undefined;

  return `⚠ 응급 가능성 — '${found}' 관련 위험 신호가 감지되었습니다. 즉시 119 또는 응급실 방문을 권장합니다.`;
}

function buildInteractionCheck(profile: UserProfile): string {
  const meds = asText(profile.currentMedications);
  if (meds) {
    return `현재 복용 중인 약/영양제(${meds})와의 상호작용 가능성을 약사에게 반드시 확인하세요.`;
  }
  return "처방 외 감기약, 진통제, 건강기능식품 추가 전 상호작용 가능성을 확인하세요.";
}

function decideRisk(
  profile: UserProfile,
  ocr: OcrResult,
  emergencyWarning?: string
): { riskLevel: RiskLevel; riskReason: string; riskEvidence: string[] } {
  let score = 0;
  const evidence: string[] = [];

  if (emergencyWarning) {
    score += 4;
    evidence.push("응급 키워드가 감지됨");
  }

  if (profile.age >= 65 || profile.age <= 13) {
    score += 1;
    evidence.push("연령 고위험군(고령/소아)");
  }

  if (profile.conditions.length > 0) {
    score += 1;
    evidence.push(`기저질환 존재(${profile.conditions.join(", ")})`);
  }

  if (asText(profile.allergies)) {
    score += 1;
    evidence.push("알레르기 이력 입력됨");
  }

  if (asText(profile.currentMedications)) {
    score += 1;
    evidence.push("병용약/영양제 정보 존재");
  }

  const highRiskMatch = ocr.medications.some((med) => {
    const corpus = `${normalizeText(med.name)} ${normalizeText(med.ingredient)}`;
    return HIGH_RISK_INGREDIENTS.some((keyword) => corpus.includes(normalizeText(keyword)));
  });

  if (highRiskMatch) {
    score += 2;
    evidence.push("고위험 성분 키워드 포함");
  }

  if (ocr.averageConfidence < 55) {
    score += 1;
    evidence.push(`OCR 신뢰도 낮음(${ocr.averageConfidence}%)`);
  }

  if (score >= 6) {
    return {
      riskLevel: "높음",
      riskReason: "응급 신호 또는 고위험 조합 가능성이 있어 의료진의 즉시 확인이 필요합니다.",
      riskEvidence: evidence
    };
  }

  if (score >= 3) {
    return {
      riskLevel: "중간",
      riskReason: "추가 확인이 필요한 항목이 있어 약사/의사와 상담을 권장합니다.",
      riskEvidence: evidence
    };
  }

  return {
    riskLevel: "낮음",
    riskReason: "즉시 위험 신호는 낮으나, 원문 처방 대조 및 의료진 확인이 필요합니다.",
    riskEvidence: evidence.length > 0 ? evidence : ["치명적 위험 신호는 뚜렷하지 않음"]
  };
}

function buildProfileWarnings(profile: UserProfile): string[] {
  const warnings: string[] = [];

  if (profile.age >= 65) warnings.push("고령층은 약물 대사 속도가 달라 부작용 모니터링이 더 필요합니다.");
  if (profile.age <= 13) warnings.push("소아/청소년은 체중 기반 용량 확인이 필요합니다.");
  if (profile.conditions.length > 0) {
    warnings.push(`기저질환(${profile.conditions.join(", ")}) 관점에서 금기/주의 성분 확인이 필요합니다.`);
  }
  if (asText(profile.pregnancyOrNursing)) {
    warnings.push("임신/수유 관련 정보가 있어 복용 안전성의 전문 확인이 필요합니다.");
  }
  if (asText(profile.alcoholOrSmoking)) {
    warnings.push("음주/흡연 습관은 약효 및 부작용 강도에 영향을 줄 수 있습니다.");
  }

  if (warnings.length === 0) {
    warnings.push("입력된 개인 특이사항이 적어 일반 가이드 중심으로 분석되었습니다.");
  }

  return warnings;
}

function buildQuestions(profile: UserProfile, ocr: OcrResult): string[] {
  const firstMed = ocr.medications[0]?.name || "현재 처방약";

  const questions = [
    `${firstMed} 복용 시 제 나이/기저질환에서 특히 조심해야 할 증상은 무엇인가요?`,
    "현재 복용 중인 다른 약/영양제와 시간 간격을 어떻게 두는 게 좋은가요?",
    "복용 중 이상반응이 생기면 어떤 기준으로 바로 병원에 가야 하나요?"
  ];

  if (asText(profile.allergies)) {
    questions.push(`알레르기 이력(${asText(profile.allergies)})을 고려해 대체 약이 필요한가요?`);
  }

  if (asText(profile.userQuestion)) {
    questions.push(`추가 질문: ${asText(profile.userQuestion)}`);
  }

  return questions;
}

function enforceSafetyGuardrails(result: SafetyAnalysisResult): SafetyAnalysisResult {
  const keySafetyChecks = [...result.keySafetyChecks];
  const confidenceAndLimits = [...result.confidenceAndLimits];

  if (!keySafetyChecks.some((line) => line.includes("복용 변경") || line.includes("중단"))) {
    keySafetyChecks.push("복용 변경/중단 판단은 의료진 상담 없이 진행하지 마세요.");
  }

  if (!keySafetyChecks.some((line) => line.includes("상호작용"))) {
    keySafetyChecks.push("병용약/영양제와의 상호작용 가능성은 약사에게 확인이 필요합니다.");
  }

  if (!confidenceAndLimits.some((line) => line.includes("OCR"))) {
    confidenceAndLimits.push("OCR 오인식 가능성이 있어 원문 처방전과 대조가 필요합니다.");
  }

  if (!confidenceAndLimits.some((line) => line.includes("진단") || line.includes("처방 변경"))) {
    confidenceAndLimits.push("본 결과는 정보 제공 목적이며 진단/처방 변경 판단을 대체하지 않습니다.");
  }

  const sanitizeLine = (line: string) => {
    if (FORBIDDEN_PHRASES.some((phrase) => line.includes(phrase))) {
      return `의료진 확인 필요: ${line}`;
    }
    return line;
  };

  return {
    ...result,
    keySafetyChecks: keySafetyChecks.map(sanitizeLine),
    confidenceAndLimits: confidenceAndLimits.map(sanitizeLine)
  };
}

function buildHeuristicSafetyAnalysis(profile: UserProfile, ocr: OcrResult): SafetyAnalysisResult {
  const emergencyWarning = detectEmergency(profile, ocr);
  const { riskLevel, riskReason, riskEvidence } = decideRisk(profile, ocr, emergencyWarning);

  const recognizedPrescription = ocr.medications.map(joinMedicationLine);
  const keySafetyChecks = [
    riskReason,
    buildInteractionCheck(profile),
    ocr.needsReview
      ? "OCR 신뢰도가 낮아 일부 항목이 부정확할 수 있습니다. 처방전 원문을 반드시 대조하세요."
      : "OCR 신뢰도가 비교적 양호하지만 최종 확인은 의료진과 진행하세요."
  ];

  const generalPrecautions = [
    "처방전의 용법/용량/기간을 원문 그대로 우선 적용하세요.",
    "보관 조건(실온/냉장, 습도, 직사광선)을 약 라벨 기준으로 확인하세요.",
    "새로운 건강기능식품, 감기약, 진통제 추가 전 상호작용 여부를 약사에게 확인하세요."
  ];

  const confidenceAndLimits = [
    `OCR 평균 신뢰도: ${ocr.averageConfidence}% (${ocr.provider}).`,
    "이미지 품질, 촬영 각도, 라벨 훼손으로 오인식 가능성이 있습니다.",
    "본 결과는 정보 제공 목적이며 진단/처방 변경 판단을 대체하지 않습니다."
  ];

  if (profile.recheckRequested) {
    confidenceAndLimits.push("재확인 요청 모드로 분석되었습니다. 원문 대조 후 의료진 확인이 필요합니다.");
  }

  const summaryLine =
    riskLevel === "높음"
      ? "위험 신호가 감지되어 즉시 의료진 확인이 필요한 처방입니다."
      : riskLevel === "중간"
        ? "추가 확인이 필요한 항목이 있어 복약 전 약사 상담을 권장합니다."
        : "즉시 고위험 신호는 낮지만, 원문 처방과 의료진 확인이 필요합니다.";

  return enforceSafetyGuardrails({
    summaryLine,
    recognizedPrescription,
    keySafetyChecks,
    profileWarnings: buildProfileWarnings(profile),
    commonSideEffects: COMMON_SIDE_EFFECT_LIBRARY,
    generalPrecautions,
    pharmacistQuestions: buildQuestions(profile, ocr),
    confidenceAndLimits,
    riskLevel,
    riskReason,
    riskEvidence,
    emergencyWarning,
    analysisProvider: "heuristic"
  });
}

async function runOpenAiSafetyAnalysis(
  profile: UserProfile,
  ocr: OcrResult,
  emergencyWarning: string | undefined,
  fallback: SafetyAnalysisResult
): Promise<SafetyAnalysisResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4.1-mini";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary_line: { type: "string" },
      recognized_prescription: {
        type: "array",
        items: { type: "string" }
      },
      key_safety_checks: {
        type: "array",
        items: { type: "string" }
      },
      profile_warnings: {
        type: "array",
        items: { type: "string" }
      },
      common_side_effects: {
        type: "array",
        items: { type: "string" }
      },
      general_precautions: {
        type: "array",
        items: { type: "string" }
      },
      pharmacist_questions: {
        type: "array",
        items: { type: "string" }
      },
      confidence_and_limits: {
        type: "array",
        items: { type: "string" }
      },
      risk_level: {
        type: "string",
        enum: ["높음", "중간", "낮음"]
      },
      risk_reason: { type: "string" },
      risk_evidence: {
        type: "array",
        items: { type: "string" }
      },
      emergency_warning: { type: "string" }
    },
    required: [
      "summary_line",
      "recognized_prescription",
      "key_safety_checks",
      "profile_warnings",
      "common_side_effects",
      "general_precautions",
      "pharmacist_questions",
      "confidence_and_limits",
      "risk_level",
      "risk_reason",
      "risk_evidence",
      "emergency_warning"
    ]
  };

  const instruction = [
    "당신은 약 처방 안전 검토 보조 시스템입니다.",
    "반드시 JSON만 출력하세요.",
    "의료 진단/처방 변경 지시/복용 중단 권고/단정적 표현을 금지합니다.",
    "불확실할 경우 '확인 필요'를 명시하세요.",
    "상호작용 가능성, OCR 오류 가능성, 의료진 확인 필요를 반드시 포함하세요.",
    "risk_level은 높음/중간/낮음 중 하나로 선택하고 risk_evidence에 근거를 담으세요.",
    emergencyWarning ? `응급 경고 단서: ${emergencyWarning}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const inputPayload = {
    profile,
    ocr,
    fallback_hint: {
      summaryLine: fallback.summaryLine,
      riskLevel: fallback.riskLevel,
      riskReason: fallback.riskReason,
      riskEvidence: fallback.riskEvidence
    }
  };

  const body = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: instruction }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `다음 입력을 바탕으로 안전성 분석 JSON을 생성하세요.\n${JSON.stringify(inputPayload, null, 2)}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "medcheck_safety_analysis",
        schema,
        strict: true
      }
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) return null;

    const data = (await response.json()) as OpenAiResponsesSuccess;
    const parsed = parseJsonObject<LlmSafetyResponse>(data.output_text || "");
    if (!parsed) return null;

    const riskLevel = parsed.risk_level === "높음" || parsed.risk_level === "중간" || parsed.risk_level === "낮음"
      ? parsed.risk_level
      : fallback.riskLevel;

    const llmResult: SafetyAnalysisResult = {
      summaryLine: asText(parsed.summary_line) || fallback.summaryLine,
      recognizedPrescription: ensureStringList(parsed.recognized_prescription).length
        ? ensureStringList(parsed.recognized_prescription)
        : fallback.recognizedPrescription,
      keySafetyChecks: ensureStringList(parsed.key_safety_checks).length
        ? ensureStringList(parsed.key_safety_checks)
        : fallback.keySafetyChecks,
      profileWarnings: ensureStringList(parsed.profile_warnings).length
        ? ensureStringList(parsed.profile_warnings)
        : fallback.profileWarnings,
      commonSideEffects: ensureStringList(parsed.common_side_effects).length
        ? ensureStringList(parsed.common_side_effects)
        : fallback.commonSideEffects,
      generalPrecautions: ensureStringList(parsed.general_precautions).length
        ? ensureStringList(parsed.general_precautions)
        : fallback.generalPrecautions,
      pharmacistQuestions: ensureStringList(parsed.pharmacist_questions).length
        ? ensureStringList(parsed.pharmacist_questions)
        : fallback.pharmacistQuestions,
      confidenceAndLimits: ensureStringList(parsed.confidence_and_limits).length
        ? ensureStringList(parsed.confidence_and_limits)
        : fallback.confidenceAndLimits,
      riskLevel,
      riskReason: asText(parsed.risk_reason) || fallback.riskReason,
      riskEvidence: ensureStringList(parsed.risk_evidence).length
        ? ensureStringList(parsed.risk_evidence)
        : fallback.riskEvidence,
      emergencyWarning: asText(parsed.emergency_warning) || emergencyWarning || fallback.emergencyWarning,
      analysisProvider: "llm"
    };

    return enforceSafetyGuardrails(llmResult);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildSafetyAnalysis(profile: UserProfile, ocr: OcrResult): Promise<SafetyAnalysisResult> {
  const heuristic = buildHeuristicSafetyAnalysis(profile, ocr);
  const llmResult = await runOpenAiSafetyAnalysis(profile, ocr, heuristic.emergencyWarning, heuristic);
  return llmResult || heuristic;
}
