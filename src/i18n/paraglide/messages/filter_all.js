/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Filter_AllInputs */

const uk_filter_all = /** @type {(inputs: Filter_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Усі`)
};

const en_filter_all = /** @type {(inputs: Filter_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`All`)
};

/**
* | output |
* | --- |
* | "All" |
*
* @param {Filter_AllInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const filter_all = /** @type {((inputs?: Filter_AllInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Filter_AllInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_filter_all(inputs)
	return en_filter_all(inputs)
});