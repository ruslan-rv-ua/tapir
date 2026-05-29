/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_LanguageInputs */

const uk_settings_language = /** @type {(inputs: Settings_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Мова`)
};

const en_settings_language = /** @type {(inputs: Settings_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Language`)
};

/**
* | output |
* | --- |
* | "Language" |
*
* @param {Settings_LanguageInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_language = /** @type {((inputs?: Settings_LanguageInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_LanguageInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_language(inputs)
	return en_settings_language(inputs)
});