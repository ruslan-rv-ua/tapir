/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Streams_Count_FewInputs */

const uk_streams_count_few = /** @type {(inputs: Streams_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} потоки`)
};

const en_streams_count_few = /** @type {(inputs: Streams_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "{count} streams" |
*
* @param {Streams_Count_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_count_few = /** @type {((inputs: Streams_Count_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Count_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_count_few(inputs)
	return en_streams_count_few(inputs)
});