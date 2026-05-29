/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Streams_Count_OneInputs */

const uk_streams_count_one = /** @type {(inputs: Streams_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} потік`)
};

const en_streams_count_one = /** @type {(inputs: Streams_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} stream`)
};

/**
* | output |
* | --- |
* | "{count} stream" |
*
* @param {Streams_Count_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_count_one = /** @type {((inputs: Streams_Count_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Count_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_count_one(inputs)
	return en_streams_count_one(inputs)
});