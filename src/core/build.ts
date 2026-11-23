declare const __BUILD_ID__: string | undefined;
declare const __BASE_COMMIT__: string | undefined;
/**
 * The build a tester runs, shown in Réglages and copied with every report (src/ui/betaInfo.ts): `<short commit>-<yyyymmdd>` (`+` when built from uncommitted
 * work), set at build time by vite.config.ts / vite.artifact.config.ts (`BUILD_ID` in the environment overrides it). « dev » under the dev server and in tests.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'dev';

/**
 * The accepted candidate a device-playtest build was made from (MOBILE-01: scripts/build-preview.mjs names it with the full commit); empty in every other build.
 * The build id above names the playtest's own commit, this names the candidate it is that commit plus diagnostics on.
 */
export const BASE_COMMIT: string = typeof __BASE_COMMIT__ === 'string' ? __BASE_COMMIT__ : '';
