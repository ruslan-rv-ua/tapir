/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Browser_SearchInputs */

const uk_zone_browser_search = /** @type {(inputs: Zone_Browser_SearchInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пошук`)
};

const en_zone_browser_search = /** @type {(inputs: Zone_Browser_SearchInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Search`)
};

/**
* | output |
* | --- |
* | "Search" |
*
* @param {Zone_Browser_SearchInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_browser_search = /** @type {((inputs?: Zone_Browser_SearchInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Browser_SearchInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_browser_search(inputs)
	return en_zone_browser_search(inputs)
});