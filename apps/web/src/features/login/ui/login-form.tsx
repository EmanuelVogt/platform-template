import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"

import { resolveAuthedTarget } from "@/shared/lib/auth-redirect"
import { useAuthStore } from "@/shared/store/auth.store"

import { loginSchema, type LoginInput } from "../model/login.schema"
import { useLogin } from "../model/use-login"

export function LoginForm() {
  const login = useLogin()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  })

  // Sucesso → destino resolvido (intenção guardada pelo guard > última rota
  // visitada > início). O onSuccess da entity já populou o cache da sessão;
  // aqui resolve o destino, consome a intenção e navega.
  const onSubmit = handleSubmit((data) => {
    login.mutate(
      { data },
      {
        onSuccess: () => {
          const target = resolveAuthedTarget()
          useAuthStore.getState().setRedirectIntent(null)
          void navigate({ to: target })
        },
      }
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1>Entrar na conta</h1>

      {login.isError ? (
        <p role="alert">
          Não foi possível entrar. Verifique os dados e tente novamente.
        </p>
      ) : null}

      <p>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email ? <span role="alert">{errors.email.message}</span> : null}
      </p>

      <p>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password ? (
          <span role="alert">{errors.password.message}</span>
        ) : null}
      </p>

      <p>
        <label htmlFor="rememberMe">Manter conectado</label>
        <input id="rememberMe" type="checkbox" {...register("rememberMe")} />
      </p>

      <button type="submit" disabled={login.isPending}>
        {login.isPending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  )
}
