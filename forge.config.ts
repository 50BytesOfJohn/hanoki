import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { access, rename } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ForgeConfig, ForgeMakeResult } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
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
const MACOS_LEGACY_ICON_PATH = `${ICON_BASE_PATH}.icns`;
const MACOS_ICON_COMPOSER_PATH = path.resolve(__dirname, "assets/icons/icon-composer.icon");
const WINDOWS_ICON_PATH = `${ICON_BASE_PATH}.ico`;
const LINUX_ICON_PATH = `${ICON_BASE_PATH}.png`;
const APPLE_CODESIGN_IDENTITY = process.env.APPLE_CODESIGN_IDENTITY;
const APPLE_ID = process.env.APPLE_ID;
const APPLE_APP_SPECIFIC_PASSWORD = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const isPrereleaseTag = (process.env.GITHUB_REF_NAME ?? "").includes("-");
// Derive the GitHub repository from the Actions-provided `GITHUB_REPOSITORY`
// ("owner/name"), falling back to the canonical repository when run locally.
const [GITHUB_REPOSITORY_OWNER, GITHUB_REPOSITORY_NAME] = (
  process.env.GITHUB_REPOSITORY ?? "50BytesOfJohn/hanoki"
).split("/");
const execFile = promisify(execFileCallback);
const hasMacDeveloperSigningIdentity = Boolean(APPLE_CODESIGN_IDENTITY);
const shouldNotarizeMacApp =
  hasMacDeveloperSigningIdentity &&
  Boolean(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);

const findActoolPath = () => {
  if (process.platform !== "darwin") {
    return undefined;
  }

  try {
    return execFileSync("xcrun", ["--find", "actool"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

const actoolPath = findActoolPath();

if (actoolPath) {
  process.env.PATH = `${path.dirname(actoolPath)}:${process.env.PATH ?? ""}`;
}

const packagerIcon =
  process.platform === "darwin"
    ? actoolPath
      ? [MACOS_LEGACY_ICON_PATH, MACOS_ICON_COMPOSER_PATH]
      : MACOS_LEGACY_ICON_PATH
    : ICON_BASE_PATH;

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

// `@electron-forge/publisher-github` sends an explicit `content-length` header
// next to the Buffer body, and `fetch` appends its own value derived from that
// body, yielding a duplicated header ("126273725, 126273725"). Node's bundled
// undici tolerates it, but the Forge CLI installs undici v7 as the global
// dispatcher (`@electron/get`'s `initializeProxy`) and v7 rejects the value with
// "invalid content-length header", failing every asset upload. Drop the
// redundant header so `fetch` is the only thing that sets it.
const fetchWithoutExplicitContentLength: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.delete("content-length");

  return fetch(input, { ...init, headers });
};

const pathExists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
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
    icon: packagerIcon,
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
    new MakerDMG(
      {
        icon: MACOS_LEGACY_ICON_PATH,
        iconSize: 96,
        title: `Install ${APP_NAME}`,
      },
      ["darwin"],
    ),
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
          owner: GITHUB_REPOSITORY_OWNER,
          name: GITHUB_REPOSITORY_NAME,
        },
        draft: false,
        prerelease: isPrereleaseTag,
        generateReleaseNotes: true,
        force: true,
        octokitOptions: {
          request: { fetch: fetchWithoutExplicitContentLength },
        },
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
