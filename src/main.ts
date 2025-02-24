import * as core from '@actions/core'
import {Method, parseMethod} from './method'
import {OSType, getOs} from './platform'
import {aptInstall, aptSetup, useApt} from './apt-installer'
import {download} from './downloader'
import {getVersion} from './version'
import {install} from './installer'
import {updatePath} from './update-path'
import {parsePackages} from './parser'

async function run(): Promise<void> {
  try {
    const cuda: string = core.getInput('cuda')
    core.debug(`Desired cuda version: ${cuda}`)
    const subPackagesArgName = 'sub-packages'
    const subPackages: string = core.getInput(subPackagesArgName)
    core.debug(`Desired subPackages: ${subPackages}`)
    const nonCudaSubPackagesArgName = 'non-cuda-sub-packages'
    const nonCudaSubPackages: string = core.getInput(nonCudaSubPackagesArgName)
    core.debug(`Desired nonCudasubPackages: ${nonCudaSubPackages}`)
    const methodString: string = core.getInput('method')
    core.debug(`Desired method: ${methodString}`)
    const linuxLocalArgs: string = core.getInput('linux-local-args')
    core.debug(`Desired local linux args: ${linuxLocalArgs}`)
    const useGitHubCache: boolean = core.getBooleanInput('use-github-cache')
    core.debug(`Desired GitHub cache usage: ${useGitHubCache}`)

    // Parse subPackages array
    const subPackagesArray: string[] = await parsePackages(
      subPackages,
      subPackagesArgName
    )

    // Parse nonCudaSubPackages array
    const nonCudaSubPackagesArray: string[] = await parsePackages(
      nonCudaSubPackages,
      nonCudaSubPackagesArgName
    )

    // Parse method
    const methodParsed: Method = parseMethod(methodString)
    core.debug(`Parsed method: ${methodParsed}`)

    // Parse version string
    const version = await getVersion(cuda, methodParsed)

    // Parse linuxLocalArgs array
    let linuxLocalArgsArray: string[] = []
    try {
      linuxLocalArgsArray = JSON.parse(linuxLocalArgs)
      // TODO verify that elements are valid package names (--samples, --driver, --toolkit, etc.)
    } catch (error) {
      const errString = `Error parsing input 'linux-local-args' to a JSON string array: ${linuxLocalArgs}`
      core.debug(errString)
      throw new Error(errString)
    }

    // Check if subPackages are specified in 'local' method on Linux
    if (
      methodParsed === 'local' &&
      subPackagesArray.length > 0 &&
      (await getOs()) === OSType.linux
    ) {
      throw new Error(
        `Subpackages on 'local' method is not supported on Linux, use 'network' instead`
      )
    }

    // Linux network install (uses apt repository)
    const useAptInstall = await useApt(methodParsed)
    if (useAptInstall) {
      // Setup aptitude repos
      await aptSetup(version)
      // Install packages
      const installResult = await aptInstall(
        version,
        subPackagesArray,
        nonCudaSubPackagesArray
      )
      core.debug(`Install result: ${installResult}`)
    } else {
      // Download
      const executablePath: string = await download(
        version,
        methodParsed,
        useGitHubCache
      )

      // Install
      await install(
        executablePath,
        version,
        subPackagesArray,
        linuxLocalArgsArray
      )
    }

    // Add CUDA environment variables to GitHub environment variables
    const cudaPath: string = await updatePath(version)

    // Set output variables
    core.setOutput('cuda', cuda)
    core.setOutput('CUDA_PATH', cudaPath)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error)
    } else {
      core.setFailed('Unknown error')
    }
  }
}

run()
