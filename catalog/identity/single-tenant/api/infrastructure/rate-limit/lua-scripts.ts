// Scripts Lua executados atomicamente no Redis (EVAL). A lógica multi-passo roda
// dentro do servidor, sem corrida entre comandos.

/**
 * Sliding-window via ZSET: cada request vira um membro com score = timestamp
 * (ms). A cada chamada remove eventos fora da janela deslizante e conta os
 * restantes. Admite só se count < limit (gate negado não consome slot). Sem
 * boundary reset → o limite N nunca é excedido em nenhuma janela de N segundos.
 *
 * KEYS[1] = chave do bucket.
 * ARGV[1] = windowSeconds; ARGV[2] = limit; ARGV[3] = nowMs; ARGV[4] = membro
 * único (nowMs+uuid, senão o ZADD sobrescreveria e subcontaria).
 * Retorna [allowed (0|1), retryAfterSeconds].
 */
export const SLIDING_WINDOW_SCRIPT = `
local window_ms = tonumber(ARGV[1]) * 1000
local limit = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now_ms - window_ms)
local count = redis.call('ZCARD', KEYS[1])
if count < limit then
  redis.call('ZADD', KEYS[1], now_ms, member)
  redis.call('PEXPIRE', KEYS[1], window_ms)
  return {1, 0}
end
redis.call('PEXPIRE', KEYS[1], window_ms)
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local retry = 1
if oldest[2] then
  retry = math.ceil((tonumber(oldest[2]) + window_ms - now_ms) / 1000)
  if retry < 1 then retry = 1 end
end
return {0, retry}
`
