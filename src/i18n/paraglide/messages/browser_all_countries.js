/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_All_CountriesInputs */

const uk_browser_all_countries = /** @type {(inputs: Browser_All_CountriesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Усі країни`)
};

const en_browser_all_countries = /** @type {(inputs: Browser_All_CountriesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`All countries`)
};

/**
* | output |
* | --- |
* | "All countries" |
*
* @param {Browser_All_CountriesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_all_countries = /** @type {((inputs?: Browser_All_CountriesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_All_CountriesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_all_countries(inputs)
	return en_browser_all_countries(inputs)
});