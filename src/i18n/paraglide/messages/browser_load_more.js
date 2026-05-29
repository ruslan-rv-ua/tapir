/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Load_MoreInputs */

const uk_browser_load_more = /** @type {(inputs: Browser_Load_MoreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Завантажити ще`)
};

const en_browser_load_more = /** @type {(inputs: Browser_Load_MoreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Load more`)
};

/**
* | output |
* | --- |
* | "Load more" |
*
* @param {Browser_Load_MoreInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_load_more = /** @type {((inputs?: Browser_Load_MoreInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Load_MoreInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_load_more(inputs)
	return en_browser_load_more(inputs)
});