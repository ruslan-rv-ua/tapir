/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Filter_CountryInputs */

const uk_browser_filter_country = /** @type {(inputs: Browser_Filter_CountryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Країна`)
};

const en_browser_filter_country = /** @type {(inputs: Browser_Filter_CountryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Country`)
};

/**
* | output |
* | --- |
* | "Country" |
*
* @param {Browser_Filter_CountryInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_filter_country = /** @type {((inputs?: Browser_Filter_CountryInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Filter_CountryInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_filter_country(inputs)
	return en_browser_filter_country(inputs)
});