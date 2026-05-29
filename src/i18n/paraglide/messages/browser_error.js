/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ error: NonNullable<unknown> }} Browser_ErrorInputs */

const uk_browser_error = /** @type {(inputs: Browser_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Помилка пошуку: ${i?.error}`)
};

const en_browser_error = /** @type {(inputs: Browser_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Search error: ${i?.error}`)
};

/**
* | output |
* | --- |
* | "Search error: {error}" |
*
* @param {Browser_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_error = /** @type {((inputs: Browser_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_error(inputs)
	return en_browser_error(inputs)
});