import { CompleteProfileForm } from "@/components/auth/CompleteProfileForm";

export const metadata = {
  title: "Complete your profile · Get Vaulted",
};

export default function CompleteProfilePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <CompleteProfileForm />
    </main>
  );
}
