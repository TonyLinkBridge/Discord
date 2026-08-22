"use client";

import { signOut } from "next-auth/react";
import styles from "./auth-state.module.css";

export function SignOutButton() {
  return (
    <button
      className={styles.secondaryAction}
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      type="button"
    >
      Sign out and try another account
    </button>
  );
}
