import type { AnalyzeResponse } from "@/lib/types";

export function buildDoctorSummaryText(result: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push("[MedCheck AI 요약본]");
  lines.push(`생성시각: ${new Date(result.generatedAt).toLocaleString("ko-KR")}`);
  lines.push("");
  lines.push("[안전 면책]");
  lines.push(result.disclaimer);
  lines.push("");

  if (result.analysis.emergencyWarning) {
    lines.push("[응급 경고]");
    lines.push(result.analysis.emergencyWarning);
    lines.push("");
  }

  lines.push("[1) 한 줄 요약]");
  lines.push(result.analysis.summaryLine);
  lines.push("");

  lines.push("[위험도]");
  lines.push(`- 등급: ${result.analysis.riskLevel}`);
  lines.push(`- 근거 요약: ${result.analysis.riskReason}`);
  for (const item of result.analysis.riskEvidence) lines.push(`- 근거: ${item}`);
  lines.push(`- 분석엔진: ${result.analysis.analysisProvider.toUpperCase()}`);
  if (typeof result.processingMs === "number") {
    lines.push(`- 처리시간: ${(result.processingMs / 1000).toFixed(2)}초`);
  }
  lines.push("");

  lines.push("[2) 인식된 처방 정보 (확인 필요)]");
  for (const item of result.analysis.recognizedPrescription) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[3) 핵심 안전 체크]");
  for (const item of result.analysis.keySafetyChecks) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[4) 기저질환/연령/성별 관점 주의사항]");
  for (const item of result.analysis.profileWarnings) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[5) 흔한 부작용 & 모니터링 포인트]");
  for (const item of result.analysis.commonSideEffects) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[6) 복용/보관/상호작용 일반 주의]");
  for (const item of result.analysis.generalPrecautions) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[7) 의사/약사에게 확인할 질문]");
  for (const item of result.analysis.pharmacistQuestions) lines.push(`- ${item}`);
  lines.push("");

  lines.push("[8) 확신도 & 한계]");
  for (const item of result.analysis.confidenceAndLimits) lines.push(`- ${item}`);

  return lines.join("\n");
}
