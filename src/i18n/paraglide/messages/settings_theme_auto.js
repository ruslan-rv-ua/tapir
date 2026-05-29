/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Theme_AutoInputs */

const uk_settings_theme_auto = /** @type {(inputs: Settings_Theme_AutoInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Автоматична`)
};

const en_settings_theme_auto = /** @type {(inputs: Settings_Theme_AutoInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Automatic`)
};

/**
* | output |
* | --- |
* | "Automatic" |
*
* @param {Settings_Theme_AutoInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_theme_auto = /** @type {((inputs?: Settings_Theme_AutoInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Theme_AutoInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_theme_auto(inputs)
	return en_settings_theme_auto(inputs)
});