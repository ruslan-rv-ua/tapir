/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Tab_RecordingInputs */

const uk_settings_tab_recording = /** @type {(inputs: Settings_Tab_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Запис`)
};

const en_settings_tab_recording = /** @type {(inputs: Settings_Tab_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording`)
};

/**
* | output |
* | --- |
* | "Recording" |
*
* @param {Settings_Tab_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_tab_recording = /** @type {((inputs?: Settings_Tab_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Tab_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_tab_recording(inputs)
	return en_settings_tab_recording(inputs)
});