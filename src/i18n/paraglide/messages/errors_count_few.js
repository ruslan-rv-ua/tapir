/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Errors_Count_FewInputs */

const uk_errors_count_few = /** @type {(inputs: Errors_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} збої`)
};

const en_errors_count_few = /** @type {(inputs: Errors_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} errors`)
};

/**
* | output |
* | --- |
* | "{count} errors" |
*
* @param {Errors_Count_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const errors_count_few = /** @type {((inputs: Errors_Count_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_Count_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_errors_count_few(inputs)
	return en_errors_count_few(inputs)
});