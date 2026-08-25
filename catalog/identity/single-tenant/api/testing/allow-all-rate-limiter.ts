// O limiter que nunca bloqueia é vocabulário do kernel (a porta é dele) — a
// entrada só reexporta para quem já importa daqui.
export { allowAllRateLimiter } from "../../../shared/test/e2e/app"
