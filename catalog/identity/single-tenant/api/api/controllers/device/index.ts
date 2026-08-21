import { ListDevicesController } from "./list-devices.controller"
import { RevokeDeviceController } from "./revoke-device.controller"
import { RevokeOtherDevicesController } from "./revoke-other-devices.controller"

/** Rotas autenticadas de dispositivos (listar/encerrar device + os demais). */
export const DEVICE_CONTROLLERS = [
  ListDevicesController,
  RevokeDeviceController,
  RevokeOtherDevicesController,
]
