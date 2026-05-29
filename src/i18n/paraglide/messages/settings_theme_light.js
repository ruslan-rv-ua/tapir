/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Theme_LightInputs */

const uk_settings_theme_light = /** @type {(inputs: Settings_Theme_LightInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Світла`)
};

const en_settings_theme_light = /** @type {(inputs: Settings_Theme_LightInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Light`)
};

/**
* | output |
* | --- |
* | "Light" |
*
* @param {Settings_Theme_LightInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_theme_light = /** @type {((inputs?: Settings_Theme_LightInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Theme_LightInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_theme_light(inputs)
	return en_settings_theme_light(inputs)
});