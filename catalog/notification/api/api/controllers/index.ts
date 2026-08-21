import { FEED_CONTROLLERS } from "./feed"
import { SseController } from "./stream/sse.controller"

export const CONTROLLERS = [...FEED_CONTROLLERS, SseController]
