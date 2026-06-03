/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_CodecInputs */

const uk_segment_codec = /** @type {(inputs: Segment_CodecInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`кодек`)
};

const en_segment_codec = /** @type {(inputs: Segment_CodecInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`codec`)
};

/**
* | output |
* | --- |
* | "codec" |
*
* @param {Segment_CodecInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_codec = /** @type {((inputs?: Segment_CodecInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_CodecInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_codec(inputs)
	return en_segment_codec(inputs)
});