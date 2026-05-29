/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Streams_Count_ManyInputs */

const uk_streams_count_many = /** @type {(inputs: Streams_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} потоків`)
};

const en_streams_count_many = /** @type {(inputs: Streams_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "{count} streams" |
*
* @param {Streams_Count_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_count_many = /** @type {((inputs: Streams_Count_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Count_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_count_many(inputs)
	return en_streams_count_many(inputs)
});