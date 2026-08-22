import styles from "@/features/auth/auth-state.module.css";
import { SignOutButton } from "@/features/auth/sign-out-button";

interface AccessDeniedPageProps {
  searchParams: Promise<{ reason?: string | string[] }>;
}

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const reason = (await searchParams).reason;
  const isMisconfigured = reason === "misconfigured";

  return (
    <main className={styles.page}>
      <section aria-labelledby="access-title" className={styles.panel}>
        <p className={styles.eyebrow}>Private admin</p>
        <h1 className={styles.title} id="access-title">
          {isMisconfigured ? "Admin access is not configured" : "Access denied"}
        </h1>
        <p className={styles.copy}>
          {isMisconfigured
            ? "The required server-side authentication settings are unavailable. Contact the operator."
            : "This Discord account is not approved to access the RayName administration console."}
        </p>
        {!isMisconfigured ? <SignOutButton /> : null}
      </section>
    </main>
  );
}
