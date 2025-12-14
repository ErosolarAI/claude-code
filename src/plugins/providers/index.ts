import { registerDeepSeekProviderPlugin } from './deepseek/index.js';
import { registerXaiProviderPlugin } from './xai/index.js';

let defaultsRegistered = false;

export function registerDefaultProviderPlugins(): void {
  if (defaultsRegistered) {
    return;
  }

  // Only deepseek (default) and xai (backup) are supported
  registerDeepSeekProviderPlugin();
  registerXaiProviderPlugin();

  defaultsRegistered = true;
}
