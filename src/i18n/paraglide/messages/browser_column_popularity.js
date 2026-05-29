/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Column_PopularityInputs */

const uk_browser_column_popularity = /** @type {(inputs: Browser_Column_PopularityInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Популярність`)
};

const en_browser_column_popularity = /** @type {(inputs: Browser_Column_PopularityInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Popularity`)
};

/**
* | output |
* | --- |
* | "Popularity" |
*
* @param {Browser_Column_PopularityInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_column_popularity = /** @type {((inputs?: Browser_Column_PopularityInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Column_PopularityInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_column_popularity(inputs)
	return en_browser_column_popularity(inputs)
});