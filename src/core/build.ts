declare const __BUILD_ID__: string | undefined;
/**
 * The build a tester runs, shown in Réglages and copied with every report (src/ui/betaInfo.ts): `<short commit>-<yyyymmdd>` (`+` when built from uncommitted
 * work), set at build time by vite.config.ts / vite.artifact.config.ts (`BUILD_ID` in the environment overrides it). « dev » under the dev server and in tests.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'dev';
