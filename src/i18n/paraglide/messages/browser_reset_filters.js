/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Reset_FiltersInputs */

const uk_browser_reset_filters = /** @type {(inputs: Browser_Reset_FiltersInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Скинути фільтри`)
};

const en_browser_reset_filters = /** @type {(inputs: Browser_Reset_FiltersInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Reset filters`)
};

/**
* | output |
* | --- |
* | "Reset filters" |
*
* @param {Browser_Reset_FiltersInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_reset_filters = /** @type {((inputs?: Browser_Reset_FiltersInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Reset_FiltersInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_reset_filters(inputs)
	return en_browser_reset_filters(inputs)
});