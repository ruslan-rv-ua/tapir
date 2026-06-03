/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_PopularityInputs */

const uk_segment_popularity = /** @type {(inputs: Segment_PopularityInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`популярність`)
};

const en_segment_popularity = /** @type {(inputs: Segment_PopularityInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`popularity`)
};

/**
* | output |
* | --- |
* | "popularity" |
*
* @param {Segment_PopularityInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_popularity = /** @type {((inputs?: Segment_PopularityInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_PopularityInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_popularity(inputs)
	return en_segment_popularity(inputs)
});