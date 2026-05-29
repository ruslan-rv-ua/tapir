/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_LoadingInputs */

const uk_browser_loading = /** @type {(inputs: Browser_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пошук станцій...`)
};

const en_browser_loading = /** @type {(inputs: Browser_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Searching stations...`)
};

/**
* | output |
* | --- |
* | "Searching stations..." |
*
* @param {Browser_LoadingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_loading = /** @type {((inputs?: Browser_LoadingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_LoadingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_loading(inputs)
	return en_browser_loading(inputs)
});