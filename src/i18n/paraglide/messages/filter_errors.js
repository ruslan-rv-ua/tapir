/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Filter_ErrorsInputs */

const uk_filter_errors = /** @type {(inputs: Filter_ErrorsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`З помилками`)
};

const en_filter_errors = /** @type {(inputs: Filter_ErrorsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`With errors`)
};

/**
* | output |
* | --- |
* | "With errors" |
*
* @param {Filter_ErrorsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const filter_errors = /** @type {((inputs?: Filter_ErrorsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Filter_ErrorsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_filter_errors(inputs)
	return en_filter_errors(inputs)
});