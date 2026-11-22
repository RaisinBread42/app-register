// The obsidian theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in obsidian.settings.json and the generated obsidian.settings.ts;
// change them with `astryx experimental theme editor set obsidian ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {obsidianSettings} from './obsidian.settings';

export const obsidianTheme = defineTheme({
  extends: obsidianSettings,
  name: 'obsidian',
});
