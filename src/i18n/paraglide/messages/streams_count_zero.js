/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Count_ZeroInputs */

const uk_streams_count_zero = /** @type {(inputs: Streams_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає потоків`)
};

const en_streams_count_zero = /** @type {(inputs: Streams_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No streams`)
};

/**
* | output |
* | --- |
* | "No streams" |
*
* @param {Streams_Count_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_count_zero = /** @type {((inputs?: Streams_Count_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Count_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_count_zero(inputs)
	return en_streams_count_zero(inputs)
});