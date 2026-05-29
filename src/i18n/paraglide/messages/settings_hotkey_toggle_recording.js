/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Toggle_RecordingInputs */

const uk_settings_hotkey_toggle_recording = /** @type {(inputs: Settings_Hotkey_Toggle_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Запис (toggle)`)
};

const en_settings_hotkey_toggle_recording = /** @type {(inputs: Settings_Hotkey_Toggle_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording (toggle)`)
};

/**
* | output |
* | --- |
* | "Recording (toggle)" |
*
* @param {Settings_Hotkey_Toggle_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_toggle_recording = /** @type {((inputs?: Settings_Hotkey_Toggle_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Toggle_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_toggle_recording(inputs)
	return en_settings_hotkey_toggle_recording(inputs)
});