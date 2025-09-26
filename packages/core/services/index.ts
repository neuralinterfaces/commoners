import {
  createPyInstallerServices,
  PyInstallerService,
  PyInstallerServiceProperties,
} from './python.js'

export const python = {
  services: createPyInstallerServices,
  service: (service: PyInstallerServiceProperties, out: string) =>
    new PyInstallerService(service, out),
}
