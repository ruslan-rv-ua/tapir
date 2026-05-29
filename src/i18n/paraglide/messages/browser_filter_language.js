/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Filter_LanguageInputs */

const uk_browser_filter_language = /** @type {(inputs: Browser_Filter_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Мова`)
};

const en_browser_filter_language = /** @type {(inputs: Browser_Filter_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Language`)
};

/**
* | output |
* | --- |
* | "Language" |
*
* @param {Browser_Filter_LanguageInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_filter_language = /** @type {((inputs?: Browser_Filter_LanguageInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Filter_LanguageInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_filter_language(inputs)
	return en_browser_filter_language(inputs)
});