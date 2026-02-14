import type { OcrMedication, OcrResult, RiskLevel, SafetyAnalysisResult, UserProfile } from "@/lib/types";

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

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
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

  const found = EMERGENCY_KEYWORDS.find((k) => corpus.includes(k));
  if (!found) return undefined;

  return `⚠ 응급 가능성 — '${found}' 관련 위험 신호가 감지되었습니다. 즉시 119 또는 응급실 방문을 권장합니다.`;
}

function decideRisk(profile: UserProfile, ocr: OcrResult, emergencyWarning?: string): {
  riskLevel: RiskLevel;
  riskReason: string;
} {
  let score = 0;

  if (emergencyWarning) score += 4;
  if (profile.age >= 65 || profile.age <= 13) score += 1;
  if (profile.conditions.length > 0) score += 1;
  if ((profile.allergies || "").trim()) score += 1;
  if ((profile.currentMedications || "").trim()) score += 1;

  const highRiskMatch = ocr.medications.some((med) => {
    const corpus = `${normalizeText(med.name)} ${normalizeText(med.ingredient)}`;
    return HIGH_RISK_INGREDIENTS.some((keyword) => corpus.includes(normalizeText(keyword)));
  });
  if (highRiskMatch) score += 2;

  if (ocr.averageConfidence < 55) score += 1;

  if (score >= 6) {
    return {
      riskLevel: "높음",
      riskReason: "응급 신호 또는 고위험 조합 가능성이 있어 의료진의 즉시 확인이 필요합니다."
    };
  }

  if (score >= 3) {
    return {
      riskLevel: "중간",
      riskReason: "추가 확인이 필요한 항목이 있어 약사/의사와 상담을 권장합니다."
    };
  }

  return {
    riskLevel: "낮음",
    riskReason: "즉시 위험 신호는 낮으나, 변경 없이 의료진 안내를 우선으로 하세요."
  };
}

function buildProfileWarnings(profile: UserProfile): string[] {
  const warnings: string[] = [];

  if (profile.age >= 65) {
    warnings.push("고령층은 약물 대사 속도가 달라 부작용 감시가 더 필요합니다.");
  }
  if (profile.age <= 13) {
    warnings.push("소아/청소년 연령은 체중 기반 용량 확인이 필요합니다.");
  }
  if (profile.conditions.length > 0) {
    warnings.push(`기저질환(${profile.conditions.join(", ")}) 관점에서 상호작용 확인이 필요합니다.`);
  }
  if ((profile.pregnancyOrNursing || "").trim()) {
    warnings.push("임신/수유 관련 정보가 있어 복용 안전성의 전문 확인이 필요합니다.");
  }
  if ((profile.alcoholOrSmoking || "").trim()) {
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

  if ((profile.allergies || "").trim()) {
    questions.push(`알레르기 이력(${profile.allergies})을 고려해 대체 약이 필요한가요?`);
  }

  if ((profile.userQuestion || "").trim()) {
    questions.push(`추가 질문: ${profile.userQuestion}`);
  }

  return questions;
}

export function buildSafetyAnalysis(profile: UserProfile, ocr: OcrResult): SafetyAnalysisResult {
  const emergencyWarning = detectEmergency(profile, ocr);
  const { riskLevel, riskReason } = decideRisk(profile, ocr, emergencyWarning);

  const recognizedPrescription = ocr.medications.map(joinMedicationLine);

  const keySafetyChecks = [
    riskReason,
    ocr.needsReview
      ? "OCR 신뢰도가 낮아 일부 항목이 부정확할 수 있습니다. 처방전 원문을 반드시 대조하세요."
      : "OCR 신뢰도가 비교적 양호하지만 최종 확인은 의료진과 진행하세요.",
    "복용 변경/중단 판단은 의료진 상담 없이 진행하지 마세요."
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

  return {
    summaryLine:
      riskLevel === "높음"
        ? "위험 신호가 감지되어 즉시 의료진 확인이 필요한 처방입니다."
        : riskLevel === "중간"
          ? "추가 확인이 필요한 항목이 있어 복약 전 약사 상담을 권장합니다."
          : "즉시 고위험 신호는 낮지만, 원문 처방과 의료진 확인이 필요합니다.",
    recognizedPrescription,
    keySafetyChecks,
    profileWarnings: buildProfileWarnings(profile),
    commonSideEffects: COMMON_SIDE_EFFECT_LIBRARY,
    generalPrecautions,
    pharmacistQuestions: buildQuestions(profile, ocr),
    confidenceAndLimits,
    riskLevel,
    riskReason,
    emergencyWarning
  };
}
