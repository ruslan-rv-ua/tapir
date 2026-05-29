/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Browser_Results_CountInputs */

const uk_browser_results_count = /** @type {(inputs: Browser_Results_CountInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Знайдено ${i?.count} станцій`)
};

const en_browser_results_count = /** @type {(inputs: Browser_Results_CountInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Found ${i?.count} stations`)
};

/**
* | output |
* | --- |
* | "Found {count} stations" |
*
* @param {Browser_Results_CountInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_results_count = /** @type {((inputs: Browser_Results_CountInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Results_CountInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_results_count(inputs)
	return en_browser_results_count(inputs)
});