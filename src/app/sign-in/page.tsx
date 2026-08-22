import { redirect } from "next/navigation";
import { SignInButton } from "@/features/auth/sign-in-button";
import styles from "@/features/auth/auth-state.module.css";
import { getAdminAuthEnvironment } from "@/lib/auth";

export default function SignInPage() {
  const { credentialsReady } = getAdminAuthEnvironment();

  if (!credentialsReady) {
    redirect("/access-denied?reason=misconfigured");
  }

  return (
    <main className={styles.page}>
      <section aria-labelledby="sign-in-title" className={styles.panel}>
        <p className={styles.eyebrow}>Private admin</p>
        <h1 className={styles.title} id="sign-in-title">Sign in to RayName</h1>
        <p className={styles.copy}>
          Continue with the Discord account approved for this administration console.
        </p>
        <SignInButton />
      </section>
    </main>
  );
}
