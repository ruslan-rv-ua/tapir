/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Errors_Count_ZeroInputs */

const uk_errors_count_zero = /** @type {(inputs: Errors_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає збоїв`)
};

const en_errors_count_zero = /** @type {(inputs: Errors_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No errors`)
};

/**
* | output |
* | --- |
* | "No errors" |
*
* @param {Errors_Count_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const errors_count_zero = /** @type {((inputs?: Errors_Count_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_Count_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_errors_count_zero(inputs)
	return en_errors_count_zero(inputs)
});