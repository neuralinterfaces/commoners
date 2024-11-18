import { Service } from "./types";

const defaultBuildArgs = "--hiddenimport pkg_resources.extern";

type BuildConfiguration = { buildSpec?: string } | {  buildArgs?: string }
export type PyInstallerServiceProperties = Service & BuildConfiguration


export class PyInstallerService {

    constructor(
        service: Service, 
        outDir: string = `./build` // Can't have the exact same name
    ) {

        const out = `${outDir}/_${service.name}`

        const { name, description, src, publish } = service

        const sharedOptions = `-y --clean --distpath ${out}`;

        const { buildSpec, buildArgs = "" } = service

        const build = buildSpec
        ? `python -m PyInstaller ${buildSpec} ${sharedOptions}`
        : `python -m PyInstaller ${service.src} --name ${service.name} --onedir ${sharedOptions} ${defaultBuildArgs}  ${buildArgs}`

        this.description = description
        this.src = src

        this.publish = publish ?? {
            src: name,
            base: `${out}/${name}`, // The whole folder will be copied
            build // Only run build command when publishing
        }

        Object.entries(service).forEach(([key, value]) => {
            if (!(key in this)) this[key] = value;
          });
      
    }
}

export const createPyInstallerServices  = (
    services: Service[],
    outDir?: string
) => {
    
  return services.reduce((acc, service, i) => {
    acc[service.name] = new PyInstallerService(service, outDir)
    return acc;
  }, {});
};
