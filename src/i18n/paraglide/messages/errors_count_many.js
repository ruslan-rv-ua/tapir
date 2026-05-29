/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Errors_Count_ManyInputs */

const uk_errors_count_many = /** @type {(inputs: Errors_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} збоїв`)
};

const en_errors_count_many = /** @type {(inputs: Errors_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} errors`)
};

/**
* | output |
* | --- |
* | "{count} errors" |
*
* @param {Errors_Count_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const errors_count_many = /** @type {((inputs: Errors_Count_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_Count_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_errors_count_many(inputs)
	return en_errors_count_many(inputs)
});