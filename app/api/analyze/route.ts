import { NextResponse } from "next/server";
import { buildSafetyAnalysis } from "@/lib/analyze";
import { extractPrescriptionFromImage } from "@/lib/ocr";
import type { Gender, UserProfile } from "@/lib/types";

const ALLOWED_FILE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const DISCLAIMER =
  "본 서비스는 의료 정보 제공 목적이며 진단 또는 처방 변경을 대체하지 않습니다. 복용 변경은 반드시 의료 전문가와 상담하십시오.";

function toConditions(rawValue: FormDataEntryValue | null): string[] {
  if (!rawValue || typeof rawValue !== "string") return [];
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureGender(value: string): Gender {
  if (value === "male" || value === "female" || value === "other") return value;
  return "other";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const ageRaw = String(formData.get("age") || "").trim();
    const genderRaw = String(formData.get("gender") || "").trim();
    const noConditions = String(formData.get("noConditions") || "false") === "true";
    const conditionsRaw = formData.get("conditions");
    const file = formData.get("image");

    const age = Number(ageRaw);
    if (!Number.isFinite(age) || age <= 0) {
      return NextResponse.json({ error: "나이는 1 이상의 숫자여야 합니다." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "약봉지 이미지를 업로드해 주세요." }, { status: 400 });
    }

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "이미지는 JPG/JPEG/PNG만 업로드 가능합니다." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "이미지 최대 용량은 8MB입니다." }, { status: 400 });
    }

    const conditions = noConditions ? [] : toConditions(conditionsRaw);

    const profile: UserProfile = {
      age,
      gender: ensureGender(genderRaw),
      conditions,
      allergies: String(formData.get("allergies") || "").trim(),
      pregnancyOrNursing: String(formData.get("pregnancyOrNursing") || "").trim(),
      currentMedications: String(formData.get("currentMedications") || "").trim(),
      alcoholOrSmoking: String(formData.get("alcoholOrSmoking") || "").trim(),
      userQuestion: String(formData.get("userQuestion") || "").trim()
    };

    const ocr = await extractPrescriptionFromImage(file);
    const analysis = buildSafetyAnalysis(profile, ocr);

    return NextResponse.json(
      {
        disclaimer: DISCLAIMER,
        ocr,
        analysis,
        generatedAt: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. 문제가 반복되면 의료기관에 직접 문의하세요."
      },
      { status: 500 }
    );
  }
}
