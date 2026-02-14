import type { Metadata } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  variable: "--font-body"
});

const headingFont = Black_Han_Sans({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-heading"
});

export const metadata: Metadata = {
  title: "삐약 | 약 처방 안전 검토",
  description:
    "연령/성별/기저질환 정보와 약봉지 이미지를 기반으로 일반 안전성 체크와 의료진 확인 질문을 안내합니다."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${bodyFont.variable} ${headingFont.variable}`}
        style={{
          fontFamily: "var(--font-body), sans-serif"
        }}
      >
        {children}
      </body>
    </html>
  );
}
