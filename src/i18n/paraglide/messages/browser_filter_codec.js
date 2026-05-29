/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Filter_CodecInputs */

const uk_browser_filter_codec = /** @type {(inputs: Browser_Filter_CodecInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Кодек`)
};

const en_browser_filter_codec = /** @type {(inputs: Browser_Filter_CodecInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Codec`)
};

/**
* | output |
* | --- |
* | "Codec" |
*
* @param {Browser_Filter_CodecInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_filter_codec = /** @type {((inputs?: Browser_Filter_CodecInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Filter_CodecInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_filter_codec(inputs)
	return en_browser_filter_codec(inputs)
});