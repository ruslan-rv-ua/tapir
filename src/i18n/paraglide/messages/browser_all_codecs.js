/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_All_CodecsInputs */

const uk_browser_all_codecs = /** @type {(inputs: Browser_All_CodecsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Усі кодеки`)
};

const en_browser_all_codecs = /** @type {(inputs: Browser_All_CodecsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`All codecs`)
};

/**
* | output |
* | --- |
* | "All codecs" |
*
* @param {Browser_All_CodecsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_all_codecs = /** @type {((inputs?: Browser_All_CodecsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_All_CodecsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_all_codecs(inputs)
	return en_browser_all_codecs(inputs)
});