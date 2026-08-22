"use client";

import { signIn } from "next-auth/react";
import styles from "./auth-state.module.css";

export function SignInButton() {
  return (
    <button
      className={styles.primaryAction}
      onClick={() => void signIn("discord", { callbackUrl: "/" })}
      type="button"
    >
      Continue with Discord
    </button>
  );
}
