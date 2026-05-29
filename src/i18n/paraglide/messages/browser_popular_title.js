/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Popular_TitleInputs */

const uk_browser_popular_title = /** @type {(inputs: Browser_Popular_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Популярні станції`)
};

const en_browser_popular_title = /** @type {(inputs: Browser_Popular_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Popular Stations`)
};

/**
* | output |
* | --- |
* | "Popular Stations" |
*
* @param {Browser_Popular_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_popular_title = /** @type {((inputs?: Browser_Popular_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Popular_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_popular_title(inputs)
	return en_browser_popular_title(inputs)
});