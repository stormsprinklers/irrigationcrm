import { Suspense } from "react";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading…</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
