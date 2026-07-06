"use server";

import { redirect } from "next/navigation";

import { auth } from "~/auth/server";

export async function signInWithGoogle() {
  const res = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: "/dashboard",
    },
  });

  if (!res.url) {
    throw new Error("No URL returned from signInSocial");
  }

  redirect(res.url);
}
