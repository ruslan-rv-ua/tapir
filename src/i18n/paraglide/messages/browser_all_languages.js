/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_All_LanguagesInputs */

const uk_browser_all_languages = /** @type {(inputs: Browser_All_LanguagesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Усі мови`)
};

const en_browser_all_languages = /** @type {(inputs: Browser_All_LanguagesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`All languages`)
};

/**
* | output |
* | --- |
* | "All languages" |
*
* @param {Browser_All_LanguagesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_all_languages = /** @type {((inputs?: Browser_All_LanguagesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_All_LanguagesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_all_languages(inputs)
	return en_browser_all_languages(inputs)
});