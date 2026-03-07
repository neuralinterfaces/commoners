import {
  createPyInstallerServices,
  PyInstallerService,
  PyInstallerServiceProperties,
} from './python.js'

import {
  createCargoServices,
  CargoService,
  CargoServiceProperties,
} from './rust.js'

export const python = {
  services: createPyInstallerServices,
  service: (service: PyInstallerServiceProperties, out: string) =>
    new PyInstallerService(service, out),
}

export const rust = {
  services: createCargoServices,
  service: (service: CargoServiceProperties, out: string) =>
    new CargoService(service, out),
}
