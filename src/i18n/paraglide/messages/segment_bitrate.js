/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_BitrateInputs */

const uk_segment_bitrate = /** @type {(inputs: Segment_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`бітрейт`)
};

const en_segment_bitrate = /** @type {(inputs: Segment_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`bitrate`)
};

/**
* | output |
* | --- |
* | "bitrate" |
*
* @param {Segment_BitrateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_bitrate = /** @type {((inputs?: Segment_BitrateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_BitrateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_bitrate(inputs)
	return en_segment_bitrate(inputs)
});