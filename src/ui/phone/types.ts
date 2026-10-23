import type { PhoneContext } from '../phone';

/**
 * The contract between the phone's shell (src/ui/phone.ts: lifecycle, navigation, header, status) and its apps (src/ui/phone/apps/*.ts).
 * A screen draws itself into a page element the shell gives it and returns its cleanup; the shell removes the page (and so every listener on it)
 * when the screen leaves, and calls the cleanup for what lives elsewhere (a map's WebGL context, a timer, a sound).
 */
export interface PhoneApi {
  readonly ctx: PhoneContext;
  /** Pushes a screen of the phone (`arg`: a tab, an item). */
  go(id: string, arg?: string): void;
  back(): void;
  home(): void;
  /** Opens an app of the registry: a screen of the phone, or another module's app (the phone closes and hands over). */
  openApp(id: string): void;
  /** Closes the phone and hands over to another module's app (a sheet). */
  launch(fn: () => void): void;
  /** Draws the current screen again (after a setting changed). */
  rerender(): void;
  /** A short confirmation inside the phone (« Raccourci ajouté »), also read out and logged by the game's toast. */
  notify(msg: string, kind?: 'ok' | 'warn'): void;
}

export interface Screen {
  /** The header's title (it may depend on the screen's argument). */
  title: string | ((arg?: string) => string);
  /** Draws into `page`; returns the cleanup of what it started outside the page. */
  mount(page: HTMLElement, api: PhoneApi, arg?: string): void | (() => void);
  /** Every second while shown: patch the live values in place (never rebuild the page). */
  tick?(page: HTMLElement, api: PhoneApi): void;
  /** 'home': the wallpaper and no app header; 'dark': a black app (the calculator). */
  look?: 'home' | 'app' | 'dark';
}
