import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "럭키팡: 숫자던전 v3 - 수의 범위와 어림하기",
  description: "초등학교 5학년 자연수 기반 수의 범위와 어림하기 카드 배틀",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
