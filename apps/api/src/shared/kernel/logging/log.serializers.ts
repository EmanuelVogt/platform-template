import pino from "pino"

export const logSerializers: Record<string, pino.SerializerFn> = {
  err: pino.stdSerializers.err,
  req: pino.stdSerializers.req,
  res: pino.stdSerializers.res,
}
