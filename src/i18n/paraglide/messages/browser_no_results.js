/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_No_ResultsInputs */

const uk_browser_no_results = /** @type {(inputs: Browser_No_ResultsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Станцій не знайдено. Спробуйте інший запит.`)
};

const en_browser_no_results = /** @type {(inputs: Browser_No_ResultsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No stations found. Try a different query.`)
};

/**
* | output |
* | --- |
* | "No stations found. Try a different query." |
*
* @param {Browser_No_ResultsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_no_results = /** @type {((inputs?: Browser_No_ResultsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_No_ResultsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_no_results(inputs)
	return en_browser_no_results(inputs)
});