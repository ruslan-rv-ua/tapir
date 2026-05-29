/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Search_PlaceholderInputs */

const uk_browser_search_placeholder = /** @type {(inputs: Browser_Search_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Назва станції або жанр...`)
};

const en_browser_search_placeholder = /** @type {(inputs: Browser_Search_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Station name or genre...`)
};

/**
* | output |
* | --- |
* | "Station name or genre..." |
*
* @param {Browser_Search_PlaceholderInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_search_placeholder = /** @type {((inputs?: Browser_Search_PlaceholderInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Search_PlaceholderInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_search_placeholder(inputs)
	return en_browser_search_placeholder(inputs)
});