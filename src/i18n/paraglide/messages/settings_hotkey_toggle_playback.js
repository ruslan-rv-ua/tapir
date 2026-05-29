/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Toggle_PlaybackInputs */

const uk_settings_hotkey_toggle_playback = /** @type {(inputs: Settings_Hotkey_Toggle_PlaybackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворення (toggle)`)
};

const en_settings_hotkey_toggle_playback = /** @type {(inputs: Settings_Hotkey_Toggle_PlaybackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback (toggle)`)
};

/**
* | output |
* | --- |
* | "Playback (toggle)" |
*
* @param {Settings_Hotkey_Toggle_PlaybackInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_toggle_playback = /** @type {((inputs?: Settings_Hotkey_Toggle_PlaybackInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Toggle_PlaybackInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_toggle_playback(inputs)
	return en_settings_hotkey_toggle_playback(inputs)
});