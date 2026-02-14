export type Gender = "male" | "female" | "other";

export interface UserProfile {
  age: number;
  gender: Gender;
  conditions: string[];
  allergies?: string;
  pregnancyOrNursing?: string;
  currentMedications?: string;
  alcoholOrSmoking?: string;
  userQuestion?: string;
}

export interface OcrMedication {
  name: string;
  ingredient: string;
  dose: string;
  freq: string;
  days: string;
  confidence: number;
}

export interface OcrResult {
  medications: OcrMedication[];
  rawText: string;
  averageConfidence: number;
  needsReview: boolean;
  unknownFields: string[];
  provider: "openai-vision" | "fallback";
}

export type RiskLevel = "높음" | "중간" | "낮음";

export interface SafetyAnalysisResult {
  summaryLine: string;
  recognizedPrescription: string[];
  keySafetyChecks: string[];
  profileWarnings: string[];
  commonSideEffects: string[];
  generalPrecautions: string[];
  pharmacistQuestions: string[];
  confidenceAndLimits: string[];
  riskLevel: RiskLevel;
  riskReason: string;
  emergencyWarning?: string;
}

export interface AnalyzeResponse {
  disclaimer: string;
  ocr: OcrResult;
  analysis: SafetyAnalysisResult;
  generatedAt: string;
}
