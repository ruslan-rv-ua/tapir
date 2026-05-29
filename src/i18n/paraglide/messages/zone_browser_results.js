/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Browser_ResultsInputs */

const uk_zone_browser_results = /** @type {(inputs: Zone_Browser_ResultsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Результати пошуку`)
};

const en_zone_browser_results = /** @type {(inputs: Zone_Browser_ResultsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Search results`)
};

/**
* | output |
* | --- |
* | "Search results" |
*
* @param {Zone_Browser_ResultsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_browser_results = /** @type {((inputs?: Zone_Browser_ResultsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Browser_ResultsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_browser_results(inputs)
	return en_zone_browser_results(inputs)
});