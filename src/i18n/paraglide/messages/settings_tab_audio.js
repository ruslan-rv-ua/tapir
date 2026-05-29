/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Tab_AudioInputs */

const uk_settings_tab_audio = /** @type {(inputs: Settings_Tab_AudioInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Аудіо`)
};

const en_settings_tab_audio = /** @type {(inputs: Settings_Tab_AudioInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Audio`)
};

/**
* | output |
* | --- |
* | "Audio" |
*
* @param {Settings_Tab_AudioInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_tab_audio = /** @type {((inputs?: Settings_Tab_AudioInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Tab_AudioInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_tab_audio(inputs)
	return en_settings_tab_audio(inputs)
});