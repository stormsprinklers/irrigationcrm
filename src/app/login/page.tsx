import { Suspense } from "react";
import { getAppCompanyName } from "@/lib/radar-title";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const companyName = await getAppCompanyName();
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginForm companyName={companyName} />
    </Suspense>
  );
}
