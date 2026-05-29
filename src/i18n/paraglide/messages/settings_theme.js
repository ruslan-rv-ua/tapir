/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_ThemeInputs */

const uk_settings_theme = /** @type {(inputs: Settings_ThemeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Тема`)
};

const en_settings_theme = /** @type {(inputs: Settings_ThemeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Theme`)
};

/**
* | output |
* | --- |
* | "Theme" |
*
* @param {Settings_ThemeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_theme = /** @type {((inputs?: Settings_ThemeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_ThemeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_theme(inputs)
	return en_settings_theme(inputs)
});