import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
            <ScaleIcon />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-white">Andamento Processual</h1>
          <p className="mt-1 text-sm text-navy-200">Acesso restrito aos integrantes autorizados do escritório</p>
        </div>
        <div className="card p-6 sm:p-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-navy-300">
          Este sistema processa dados pessoais e informações protegidas por sigilo profissional. O acesso é registrado.
        </p>
      </div>
    </main>
  );
}

function ScaleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z" />
    </svg>
  );
}
