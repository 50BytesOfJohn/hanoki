import { execFile as execFileCallback } from "node:child_process";
import { access, cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ForgeConfig, ForgeMakeResult } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const APP_NAME = "Hanoki";
const APP_IDENTIFIER = "com.hanoki.app";
const APP_WEBSITE = "https://hanoki.app";
const ICON_BASE_PATH = path.resolve(__dirname, "assets/icons/icon");
const WINDOWS_ICON_PATH = `${ICON_BASE_PATH}.ico`;
const LINUX_ICON_PATH = `${ICON_BASE_PATH}.png`;
const APPLE_CODESIGN_IDENTITY = process.env.APPLE_CODESIGN_IDENTITY;
const APPLE_ID = process.env.APPLE_ID;
const APPLE_APP_SPECIFIC_PASSWORD = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const isPrereleaseTag = (process.env.GITHUB_REF_NAME ?? "").includes("-");
const execFile = promisify(execFileCallback);
const hasMacDeveloperSigningIdentity = Boolean(APPLE_CODESIGN_IDENTITY);
const shouldNotarizeMacApp =
  hasMacDeveloperSigningIdentity &&
  Boolean(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);

const macPackagerConfig = hasMacDeveloperSigningIdentity
  ? {
      osxSign: {
        hardenedRuntime: true,
        identity: APPLE_CODESIGN_IDENTITY as string,
      },
      ...(shouldNotarizeMacApp
        ? {
            osxNotarize: {
              appleId: APPLE_ID as string,
              appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD as string,
              teamId: APPLE_TEAM_ID as string,
            },
          }
        : {}),
    }
  : {};

const releasePlatformName = (platform: ForgeMakeResult["platform"]) => {
  switch (platform) {
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      return platform;
  }
};

const renamedArtifactPath = (makeResult: ForgeMakeResult, artifactPath: string) => {
  const platformName = releasePlatformName(makeResult.platform);
  const version = makeResult.packageJSON.version;
  const artifactDir = path.dirname(artifactPath);
  const artifactName = path.basename(artifactPath);
  const artifactExtension = path.extname(artifactPath).toLowerCase();
  const releaseName = `hanoki-${platformName}-${version}`;

  if (makeResult.platform === "win32") {
    if (artifactName === "RELEASES") {
      return path.join(artifactDir, `${releaseName}-releases`);
    }

    if (artifactName.endsWith(".nupkg")) {
      if (artifactName.includes("-delta.")) {
        return path.join(artifactDir, `${releaseName}-delta.nupkg`);
      }

      return path.join(artifactDir, `${releaseName}-full.nupkg`);
    }

    if (artifactExtension === ".exe") {
      return path.join(artifactDir, `${releaseName}-setup.exe`);
    }

    if (artifactExtension === ".msi") {
      return path.join(artifactDir, `${releaseName}.msi`);
    }
  }

  return path.join(artifactDir, `${releaseName}${artifactExtension}`);
};

const pathExists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const copyPackagedNodeModules = async (buildPath: string) => {
  const packagedNodeModulesPath = path.join(buildPath, "node_modules");
  const runtimeDependencies = ["better-sqlite3", "bindings"];

  await mkdir(packagedNodeModulesPath, { recursive: true });

  await Promise.all(
    runtimeDependencies.map(async (dependencyName) => {
      const sourcePath = path.resolve(__dirname, "node_modules", dependencyName);
      const targetPath = path.join(packagedNodeModulesPath, dependencyName);

      await cp(sourcePath, targetPath, {
        force: true,
        recursive: true,
      });
    }),
  );
};

const runCodesign = async (args: string[]) => {
  await execFile("codesign", args);
};

const ensureMacAppSignature = async (appPath: string) => {
  if (!hasMacDeveloperSigningIdentity) {
    await runCodesign(["--force", "--deep", "--sign", "-", appPath]);
  }

  await runCodesign(["--verify", "--deep", "--strict", "--verbose=2", appPath]);
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/*.node",
    },
    appBundleId: APP_IDENTIFIER,
    appCategoryType: "public.app-category.productivity",
    extraResource: ["src/main-process/db/migrations"],
    executableName: APP_NAME,
    icon: ICON_BASE_PATH,
    name: APP_NAME,
    ...macPackagerConfig,
    win32metadata: {
      CompanyName: APP_NAME,
      FileDescription: APP_NAME,
      InternalName: APP_NAME,
      OriginalFilename: `${APP_NAME}.exe`,
      ProductName: APP_NAME,
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      await copyPackagedNodeModules(buildPath);
    },
    postPackage: async (_forgeConfig, packageResult) => {
      if (packageResult.platform !== "darwin" || process.platform !== "darwin") {
        return;
      }

      for (const outputPath of packageResult.outputPaths) {
        const appPath = path.join(outputPath, `${APP_NAME}.app`);

        if (!(await pathExists(appPath))) {
          continue;
        }

        await ensureMacAppSignature(appPath);
      }
    },
    postMake: async (_forgeConfig, makeResults) => {
      for (const makeResult of makeResults) {
        makeResult.artifacts = await Promise.all(
          makeResult.artifacts.map(async (artifactPath) => {
            const nextArtifactPath = renamedArtifactPath(makeResult, artifactPath);

            if (nextArtifactPath === artifactPath) {
              return artifactPath;
            }

            await rename(artifactPath, nextArtifactPath);
            return nextArtifactPath;
          }),
        );
      }

      return makeResults;
    },
  },
  makers: [
    new MakerSquirrel({
      setupIcon: WINDOWS_ICON_PATH,
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        homepage: APP_WEBSITE,
        icon: LINUX_ICON_PATH,
      },
    }),
    new MakerDeb({
      options: {
        homepage: APP_WEBSITE,
        icon: LINUX_ICON_PATH,
        maintainer: "Hanoki <hello@hanoki.app>",
      },
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "hanoki",
          name: "hanoki",
        },
        draft: false,
        prerelease: isPrereleaseTag,
        generateReleaseNotes: true,
        force: true,
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
