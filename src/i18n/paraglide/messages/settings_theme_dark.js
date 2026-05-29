/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Theme_DarkInputs */

const uk_settings_theme_dark = /** @type {(inputs: Settings_Theme_DarkInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Темна`)
};

const en_settings_theme_dark = /** @type {(inputs: Settings_Theme_DarkInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Dark`)
};

/**
* | output |
* | --- |
* | "Dark" |
*
* @param {Settings_Theme_DarkInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_theme_dark = /** @type {((inputs?: Settings_Theme_DarkInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Theme_DarkInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_theme_dark(inputs)
	return en_settings_theme_dark(inputs)
});