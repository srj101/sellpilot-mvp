import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { StoreChatIntake } from "./_components/store-chat-intake";

export default async function CreateStorePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <StoreChatIntake userName={session.user.name} />;
}
