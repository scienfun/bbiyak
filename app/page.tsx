"use client";

import { FormEvent, useMemo, useState } from "react";
import { buildDoctorSummaryText } from "@/lib/summary";
import type { AnalyzeResponse, RiskLevel } from "@/lib/types";

const MAX_FILE_SIZE_MB = 8;

interface FormState {
  age: string;
  gender: "male" | "female" | "other";
  noConditions: boolean;
  conditions: string;
  allergies: string;
  pregnancyOrNursing: string;
  currentMedications: string;
  alcoholOrSmoking: string;
  userQuestion: string;
}

const INITIAL_FORM: FormState = {
  age: "",
  gender: "female",
  noConditions: true,
  conditions: "",
  allergies: "",
  pregnancyOrNursing: "",
  currentMedications: "",
  alcoholOrSmoking: "",
  userQuestion: ""
};

const SECTION_TITLES = [
  "1) 한 줄 요약",
  "2) 인식된 처방 정보 (확인 필요)",
  "3) 핵심 안전 체크",
  "4) 기저질환/연령/성별 관점 주의사항",
  "5) 흔한 부작용 & 모니터링 포인트",
  "6) 복용/보관/상호작용 일반 주의",
  "7) 의사/약사에게 확인할 질문",
  "8) 확신도 & 한계"
] as const;

function riskClass(level: RiskLevel): string {
  if (level === "높음") return "badge badge-high";
  if (level === "중간") return "badge badge-mid";
  return "badge badge-low";
}

function fileValidationError(file: File | null): string | null {
  if (!file) return "약봉지 이미지를 업로드해 주세요.";

  const validType = ["image/jpeg", "image/jpg", "image/png"].includes(file.type);
  if (!validType) return "이미지는 JPG/JPEG/PNG만 업로드 가능합니다.";

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `이미지는 ${MAX_FILE_SIZE_MB}MB 이하만 업로드 가능합니다.`;
  }

  return null;
}

export default function HomePage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const canSubmit = useMemo(() => {
    const age = Number(form.age);
    if (!Number.isFinite(age) || age <= 0) return false;
    if (!form.noConditions && form.conditions.trim().length === 0) return false;
    return fileValidationError(imageFile) === null;
  }, [form, imageFile]);

  const submitAnalysis = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    const age = Number(form.age);
    if (!Number.isFinite(age) || age <= 0) {
      setError("나이는 1 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (!form.noConditions && !form.conditions.trim()) {
      setError("기저질환이 있다면 내용을 입력해 주세요. 없으면 '없음'을 선택하세요.");
      return;
    }

    const imageError = fileValidationError(imageFile);
    if (imageError) {
      setError(imageError);
      return;
    }

    const payload = new FormData();
    payload.set("age", form.age);
    payload.set("gender", form.gender);
    payload.set("noConditions", String(form.noConditions));
    payload.set("conditions", form.conditions);
    payload.set("allergies", form.allergies);
    payload.set("pregnancyOrNursing", form.pregnancyOrNursing);
    payload.set("currentMedications", form.currentMedications);
    payload.set("alcoholOrSmoking", form.alcoholOrSmoking);
    payload.set("userQuestion", form.userQuestion);
    payload.set("image", imageFile as File);

    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: payload
      });

      const data = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "분석에 실패했습니다.");
      }
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "요청 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const downloadSummary = () => {
    if (!result) return;
    const content = buildDoctorSummaryText(result);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `medcheck-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="fade-in">
      <div className="container" style={{ paddingBlock: "1.5rem 2.8rem" }}>
        <section
          className="surface"
          style={{ padding: "1.2rem 1.2rem 1.4rem", marginBottom: "1rem", position: "sticky", top: "0.8rem", zIndex: 20 }}
        >
          <p className="notice notice-disclaimer" style={{ margin: 0 }}>
            본 서비스는 의료 정보 제공 목적이며 진단 또는 처방 변경을 대체하지 않습니다. 복용 변경은 반드시 의료 전문가와 상담하십시오.
          </p>
        </section>

        <section className="surface" style={{ padding: "1.3rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: "var(--font-heading)", letterSpacing: "0.2px", fontSize: "clamp(1.6rem, 2vw, 2.2rem)" }}>
                삐약 MedCheck AI
              </h1>
              <p style={{ margin: "0.45rem 0 0", color: "var(--ink-700)", lineHeight: 1.55 }}>
                나이, 성별, 기저질환과 약봉지 이미지를 기반으로 일반 안전성 검토와 주의사항을 안내합니다.
              </p>
            </div>
            <span className="badge badge-mid">MVP · Session Only</span>
          </div>
        </section>

        <section className="surface" style={{ padding: "1.3rem", marginBottom: "1rem" }}>
          <form onSubmit={submitAnalysis} className="grid" style={{ gap: "1rem" }}>
            <div className="grid grid-2">
              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>나이 (필수)</div>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.age}
                  onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value.replace(/[^0-9]/g, "") }))}
                  placeholder="예: 38"
                  required
                />
              </label>

              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>성별 (필수)</div>
                <select
                  className="select"
                  value={form.gender}
                  onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value as FormState["gender"] }))}
                >
                  <option value="female">여성</option>
                  <option value="male">남성</option>
                  <option value="other">기타</option>
                </select>
              </label>
            </div>

            <div className="surface" style={{ padding: "0.9rem", borderRadius: "14px" }}>
              <div style={{ fontWeight: 700, marginBottom: ".45rem" }}>기저질환 (필수)</div>
              <label style={{ display: "inline-flex", gap: ".4rem", alignItems: "center", marginBottom: ".6rem" }}>
                <input
                  type="checkbox"
                  checked={form.noConditions}
                  onChange={(e) => setForm((prev) => ({ ...prev, noConditions: e.target.checked }))}
                />
                없음
              </label>
              <textarea
                className="textarea"
                placeholder="예: 고혈압, 당뇨 (쉼표로 구분)"
                disabled={form.noConditions}
                value={form.conditions}
                onChange={(e) => setForm((prev) => ({ ...prev, conditions: e.target.value }))}
              />
            </div>

            <div className="grid grid-2">
              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>약물 알레르기 (선택)</div>
                <input
                  className="input"
                  value={form.allergies}
                  onChange={(e) => setForm((prev) => ({ ...prev, allergies: e.target.value }))}
                  placeholder="예: 페니실린"
                />
              </label>

              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>임신/수유 여부 (선택)</div>
                <input
                  className="input"
                  value={form.pregnancyOrNursing}
                  onChange={(e) => setForm((prev) => ({ ...prev, pregnancyOrNursing: e.target.value }))}
                  placeholder="예: 임신 16주 / 해당 없음"
                />
              </label>
            </div>

            <label>
              <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>현재 복용 중인 약/영양제 (선택)</div>
              <textarea
                className="textarea"
                value={form.currentMedications}
                onChange={(e) => setForm((prev) => ({ ...prev, currentMedications: e.target.value }))}
                placeholder="예: 혈압약 A, 오메가3"
              />
            </label>

            <div className="grid grid-2">
              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>음주/흡연 여부 (선택)</div>
                <input
                  className="input"
                  value={form.alcoholOrSmoking}
                  onChange={(e) => setForm((prev) => ({ ...prev, alcoholOrSmoking: e.target.value }))}
                  placeholder="예: 주 2회 음주"
                />
              </label>

              <label>
                <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>사용자 질문 (선택)</div>
                <input
                  className="input"
                  value={form.userQuestion}
                  onChange={(e) => setForm((prev) => ({ ...prev, userQuestion: e.target.value }))}
                  placeholder="예: 당뇨 환자인데 저혈당 위험이 있나요?"
                />
              </label>
            </div>

            <label>
              <div style={{ marginBottom: ".45rem", fontWeight: 700 }}>
                약봉지 / 처방 라벨 이미지 업로드 (필수, jpg/jpeg/png, 최대 {MAX_FILE_SIZE_MB}MB)
              </div>
              <input
                type="file"
                className="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>

            {error && (
              <div className="notice notice-warning" role="alert">
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}>
              <button className="primary-btn" type="submit" disabled={!canSubmit || loading}>
                {loading ? "분석 중..." : "처방 안전성 분석 시작"}
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  setForm(INITIAL_FORM);
                  setImageFile(null);
                  setError(null);
                  setResult(null);
                }}
              >
                입력 초기화
              </button>
            </div>
          </form>
        </section>

        {loading && (
          <section className="surface fade-in" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".55rem", marginBottom: ".45rem" }}>
              <span className="pulse" />
              <strong>OCR + 안전성 분석 처리 중</strong>
            </div>
            <p style={{ margin: 0, color: "var(--ink-700)" }}>
              이미지에서 처방 정보를 추출하고, 연령/기저질환 관점의 위험 신호를 점검하고 있습니다.
            </p>
          </section>
        )}

        {result && (
          <section className="fade-in" style={{ marginBottom: "2rem" }}>
            {result.analysis.emergencyWarning && (
              <div className="notice notice-warning" style={{ marginBottom: "1rem", fontWeight: 800 }}>
                {result.analysis.emergencyWarning}
              </div>
            )}

            <div className="surface" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: ".87rem", color: "var(--ink-500)", marginBottom: ".35rem" }}>위험도 분류</div>
                  <span className={riskClass(result.analysis.riskLevel)}>{result.analysis.riskLevel}</span>
                  <p style={{ margin: ".55rem 0 0", color: "var(--ink-700)" }}>{result.analysis.riskReason}</p>
                </div>
                <button className="secondary-btn" onClick={downloadSummary}>
                  의사/약사에게 보여주기용 요약 다운로드
                </button>
              </div>
            </div>

            <div className="grid">
              <article className="section-card">
                <h3>{SECTION_TITLES[0]}</h3>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{result.analysis.summaryLine}</p>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[1]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.recognizedPrescription.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[2]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.keySafetyChecks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[3]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.profileWarnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[4]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.commonSideEffects.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[5]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.generalPrecautions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[6]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.pharmacistQuestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="section-card">
                <h3>{SECTION_TITLES[7]}</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", lineHeight: 1.65 }}>
                  {result.analysis.confidenceAndLimits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p style={{ margin: ".7rem 0 0", color: "var(--ink-500)", fontSize: ".9rem" }}>
                  생성 시각: {new Date(result.generatedAt).toLocaleString("ko-KR")}
                </p>
              </article>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
